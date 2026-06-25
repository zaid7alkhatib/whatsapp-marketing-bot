"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const bootstrap_1 = require("../database/bootstrap");
const connect_1 = require("../database/connect");
const channel_account_model_1 = require("../modules/channel-accounts/channel-account.model");
const contact_section_model_1 = require("../modules/contact-sections/contact-section.model");
const contact_section_service_1 = require("../modules/contact-sections/contact-section.service");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
function getArgumentValue(prefix) {
    const argument = process.argv.find((value) => value.startsWith(prefix));
    return argument ? argument.slice(prefix.length).trim() || undefined : undefined;
}
function getInputPath() {
    const positionalInput = process.argv
        .slice(2)
        .find((value) => !value.startsWith("--"));
    if (!positionalInput) {
        throw new Error("Usage: npm run import:contact-sections -- <zip-or-folder-path> [--channelAccountId=<id>]");
    }
    return path_1.default.resolve(positionalInput);
}
async function pathExists(value) {
    try {
        await promises_1.default.access(value);
        return true;
    }
    catch {
        return false;
    }
}
async function prepareInput(inputPath) {
    const stats = await promises_1.default.stat(inputPath);
    if (stats.isDirectory()) {
        return {
            directoryPath: inputPath,
            cleanup: async () => undefined,
        };
    }
    if (path_1.default.extname(inputPath).toLowerCase() !== ".zip") {
        throw new Error("Input must be a .zip file or a folder containing .txt section files.");
    }
    const tempDirectory = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "contact-sections-"));
    try {
        await execFileAsync("tar", ["-xf", inputPath, "-C", tempDirectory]);
    }
    catch {
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
        }
        else {
            await execFileAsync("unzip", ["-q", inputPath, "-d", tempDirectory]);
        }
    }
    return {
        directoryPath: tempDirectory,
        cleanup: async () => {
            await promises_1.default.rm(tempDirectory, { recursive: true, force: true });
        },
    };
}
async function findTextFiles(directoryPath) {
    const entries = await promises_1.default.readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const entryPath = path_1.default.join(directoryPath, entry.name);
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
    return files.sort((left, right) => path_1.default.basename(left).localeCompare(path_1.default.basename(right), undefined, {
        numeric: true,
        sensitivity: "base",
    }));
}
function parseContactLine(line) {
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
function createSectionName(filePath) {
    const baseName = path_1.default.basename(filePath, path_1.default.extname(filePath));
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
async function parseContactFile(filePath) {
    const content = await promises_1.default.readFile(filePath, "utf8");
    const contacts = [];
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
function preserveExistingContactState(contacts, existingContacts) {
    const existingByRef = new Map(existingContacts.map((contact) => [contact.channelUserRef, contact]));
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
async function resolveChannelAccountId() {
    const requestedChannelAccountId = getArgumentValue("--channelAccountId=") ?? env_1.env.dashboardUserChannelAccountId;
    if (requestedChannelAccountId) {
        if (!mongoose_1.default.isValidObjectId(requestedChannelAccountId)) {
            throw new Error("--channelAccountId must be a valid MongoDB ObjectId.");
        }
        const requestedAccount = await channel_account_model_1.ChannelAccountModel.findById(requestedChannelAccountId)
            .select("_id")
            .lean();
        if (!requestedAccount) {
            throw new Error(`Channel account not found: ${requestedChannelAccountId}`);
        }
        return new mongoose_1.default.Types.ObjectId(requestedChannelAccountId);
    }
    const firstAccount = await channel_account_model_1.ChannelAccountModel.findOne().sort({ createdAt: 1 }).select("_id").lean();
    if (!firstAccount) {
        throw new Error("No channel account exists. Start the app once so bootstrap can create one.");
    }
    return new mongoose_1.default.Types.ObjectId(String(firstAccount._id));
}
async function importSections() {
    const inputPath = getInputPath();
    if (!(await pathExists(inputPath))) {
        throw new Error(`Input path does not exist: ${inputPath}`);
    }
    const preparedInput = await prepareInput(inputPath);
    try {
        await (0, connect_1.connectDatabase)();
        await (0, bootstrap_1.bootstrapWhatsAppWorkspace)();
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
            const normalized = (0, contact_section_service_1.normalizeContactSectionContacts)(parsedFile.contacts);
            if (!normalized.isValid || !normalized.contacts) {
                console.warn(`[skip] ${path_1.default.basename(filePath)}: ${normalized.message ?? "Invalid contacts."}`);
                continue;
            }
            const existingSection = await contact_section_model_1.ContactSectionModel.findOne({
                channelAccountId,
                name: parsedFile.sectionName,
            }).exec();
            if (existingSection) {
                existingSection.description = `Imported from ${path_1.default.basename(inputPath)}.`;
                existingSection.set("contacts", preserveExistingContactState(normalized.contacts, existingSection.contacts));
                (0, contact_section_service_1.recalculateContactSectionMetrics)(existingSection);
                await existingSection.save();
                updatedSections += 1;
            }
            else {
                const section = new contact_section_model_1.ContactSectionModel({
                    channelAccountId,
                    name: parsedFile.sectionName,
                    description: `Imported from ${path_1.default.basename(inputPath)}.`,
                    contacts: normalized.contacts,
                });
                (0, contact_section_service_1.recalculateContactSectionMetrics)(section);
                await section.save();
                createdSections += 1;
            }
            totalContacts += normalized.contacts.length;
            console.log(`[imported] ${parsedFile.sectionName}: ${normalized.contacts.length} contact(s)`);
        }
        console.log("");
        console.log(`Channel account: ${String(channelAccountId)}`);
        console.log(`Created sections: ${createdSections}`);
        console.log(`Updated sections: ${updatedSections}`);
        console.log(`Total contacts imported: ${totalContacts}`);
        console.log(`Skipped non-contact lines: ${skippedLines}`);
    }
    finally {
        await preparedInput.cleanup();
        await mongoose_1.default.disconnect();
    }
}
void importSections().catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await mongoose_1.default.disconnect();
    process.exitCode = 1;
});
