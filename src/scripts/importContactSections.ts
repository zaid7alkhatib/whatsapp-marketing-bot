import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import mongoose from "mongoose";
import { env } from "../config/env";
import { bootstrapWhatsAppWorkspace } from "../database/bootstrap";
import { connectDatabase } from "../database/connect";
import { ChannelAccountModel } from "../modules/channel-accounts/channel-account.model";
import {
  ContactSectionContactDocument,
  ContactSectionModel,
} from "../modules/contact-sections/contact-section.model";
import {
  normalizeContactSectionContacts,
  recalculateContactSectionMetrics,
} from "../modules/contact-sections/contact-section.service";
import {
  ContactSectionContact,
  ContactSectionContactBody,
} from "../modules/contact-sections/contact-section.types";

const execFileAsync = promisify(execFile);

interface PreparedInput {
  directoryPath: string;
  cleanup: () => Promise<void>;
}

interface ParsedFile {
  filePath: string;
  sectionName: string;
  contacts: ContactSectionContactBody[];
  skippedLines: number;
}

function getArgumentValue(prefix: string): string | undefined {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() || undefined : undefined;
}

function getInputPath(): string {
  const positionalInput = process.argv
    .slice(2)
    .find((value) => !value.startsWith("--"));

  if (!positionalInput) {
    throw new Error(
      "Usage: npm run import:contact-sections -- <zip-or-folder-path> [--channelAccountId=<id>]"
    );
  }

  return path.resolve(positionalInput);
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

async function prepareInput(inputPath: string): Promise<PreparedInput> {
  const stats = await fs.stat(inputPath);
  if (stats.isDirectory()) {
    return {
      directoryPath: inputPath,
      cleanup: async () => undefined,
    };
  }

  if (path.extname(inputPath).toLowerCase() !== ".zip") {
    throw new Error("Input must be a .zip file or a folder containing .txt section files.");
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "contact-sections-"));

  try {
    await execFileAsync("tar", ["-xf", inputPath, "-C", tempDirectory]);
  } catch {
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "& { param([string]$ZipPath, [string]$DestinationPath) Expand-Archive -LiteralPath $ZipPath -DestinationPath $DestinationPath -Force }",
        inputPath,
        tempDirectory,
      ]);
    } else {
      await execFileAsync("unzip", ["-q", inputPath, "-d", tempDirectory]);
    }
  }

  return {
    directoryPath: tempDirectory,
    cleanup: async () => {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    },
  };
}

async function findTextFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTextFiles(entryPath)));
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    const isSupportFile = lowerName.includes("summary") || lowerName.includes("report");
    if (entry.isFile() && lowerName.endsWith(".txt") && !isSupportFile) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) =>
    path.basename(left).localeCompare(path.basename(right), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function parseContactLine(line: string): ContactSectionContactBody | null {
  const normalizedLine = line.trim();
  if (!normalizedLine) {
    return null;
  }

  const commaIndex = normalizedLine.lastIndexOf(",");
  if (commaIndex >= 0) {
    const displayName = normalizedLine.slice(0, commaIndex).replace(/\s+/g, " ").trim();
    const phoneNumber = normalizedLine.slice(commaIndex + 1).trim();
    return {
      displayName: displayName || undefined,
      phoneNumber,
      approved: true,
    };
  }

  const phoneMatch = normalizedLine.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!phoneMatch) {
    return null;
  }

  const displayName = normalizedLine
    .replace(phoneMatch[1], "")
    .replace(/[,;\t-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    displayName: displayName || undefined,
    phoneNumber: phoneMatch[1],
    approved: true,
  };
}

function createSectionName(filePath: string): string {
  const baseName = path.basename(filePath, path.extname(filePath));
  const sectionMatch = baseName.match(/section[_ -]?(\d+)/i);

  if (sectionMatch) {
    return `Traders 250 Section ${sectionMatch[1].padStart(2, "0")}`;
  }

  return baseName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 120);
}

async function parseContactFile(filePath: string): Promise<ParsedFile> {
  const content = await fs.readFile(filePath, "utf8");
  const contacts: ContactSectionContactBody[] = [];
  let skippedLines = 0;

  for (const line of content.split(/\r?\n/)) {
    const contact = parseContactLine(line);
    if (!contact) {
      if (line.trim()) {
        skippedLines += 1;
      }
      continue;
    }

    contacts.push(contact);
  }

  return {
    filePath,
    sectionName: createSectionName(filePath),
    contacts,
    skippedLines,
  };
}

function preserveExistingContactState(
  contacts: ContactSectionContact[],
  existingContacts: ContactSectionContactDocument[]
): ContactSectionContact[] {
  const existingByRef = new Map(
    existingContacts.map((contact) => [contact.channelUserRef, contact])
  );

  return contacts.map((contact) => {
    const existingContact = existingByRef.get(contact.channelUserRef);
    if (!existingContact) {
      return contact;
    }

    return {
      ...contact,
      lastDeliveryStatus: existingContact.lastDeliveryStatus,
      lastCampaignId: existingContact.lastCampaignId,
      lastAttemptAt: existingContact.lastAttemptAt,
      lastSentAt: existingContact.lastSentAt,
      lastErrorMessage: existingContact.lastErrorMessage,
      sendCount: existingContact.sendCount,
    };
  });
}

async function resolveChannelAccountId(): Promise<mongoose.Types.ObjectId> {
  const requestedChannelAccountId =
    getArgumentValue("--channelAccountId=") ?? env.dashboardUserChannelAccountId;

  if (requestedChannelAccountId) {
    if (!mongoose.isValidObjectId(requestedChannelAccountId)) {
      throw new Error("--channelAccountId must be a valid MongoDB ObjectId.");
    }

    const requestedAccount = await ChannelAccountModel.findById(requestedChannelAccountId)
      .select("_id")
      .lean();
    if (!requestedAccount) {
      throw new Error(`Channel account not found: ${requestedChannelAccountId}`);
    }

    return new mongoose.Types.ObjectId(requestedChannelAccountId);
  }

  const firstAccount = await ChannelAccountModel.findOne().sort({ createdAt: 1 }).select("_id").lean();
  if (!firstAccount) {
    throw new Error("No channel account exists. Start the app once so bootstrap can create one.");
  }

  return new mongoose.Types.ObjectId(String(firstAccount._id));
}

async function importSections(): Promise<void> {
  const inputPath = getInputPath();
  if (!(await pathExists(inputPath))) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const preparedInput = await prepareInput(inputPath);
  try {
    await connectDatabase();
    await bootstrapWhatsAppWorkspace();

    const channelAccountId = await resolveChannelAccountId();
    const textFiles = await findTextFiles(preparedInput.directoryPath);
    if (textFiles.length === 0) {
      throw new Error("No .txt contact section files were found in the input.");
    }

    let createdSections = 0;
    let updatedSections = 0;
    let totalContacts = 0;
    let skippedLines = 0;

    for (const filePath of textFiles) {
      const parsedFile = await parseContactFile(filePath);
      skippedLines += parsedFile.skippedLines;

      const normalized = normalizeContactSectionContacts(parsedFile.contacts);
      if (!normalized.isValid || !normalized.contacts) {
        console.warn(
          `[skip] ${path.basename(filePath)}: ${normalized.message ?? "Invalid contacts."}`
        );
        continue;
      }

      const existingSection = await ContactSectionModel.findOne({
        channelAccountId,
        name: parsedFile.sectionName,
      }).exec();

      if (existingSection) {
        existingSection.description = `Imported from ${path.basename(inputPath)}.`;
        existingSection.set(
          "contacts",
          preserveExistingContactState(normalized.contacts, existingSection.contacts)
        );
        recalculateContactSectionMetrics(existingSection);
        await existingSection.save();
        updatedSections += 1;
      } else {
        const section = new ContactSectionModel({
          channelAccountId,
          name: parsedFile.sectionName,
          description: `Imported from ${path.basename(inputPath)}.`,
          contacts: normalized.contacts,
        });
        recalculateContactSectionMetrics(section);
        await section.save();
        createdSections += 1;
      }

      totalContacts += normalized.contacts.length;
      console.log(
        `[imported] ${parsedFile.sectionName}: ${normalized.contacts.length} contact(s)`
      );
    }

    console.log("");
    console.log(`Channel account: ${String(channelAccountId)}`);
    console.log(`Created sections: ${createdSections}`);
    console.log(`Updated sections: ${updatedSections}`);
    console.log(`Total contacts imported: ${totalContacts}`);
    console.log(`Skipped non-contact lines: ${skippedLines}`);
  } finally {
    await preparedInput.cleanup();
    await mongoose.disconnect();
  }
}

void importSections().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
