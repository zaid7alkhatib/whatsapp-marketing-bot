"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgUnits = getOrgUnits;
exports.getOrgUnitById = getOrgUnitById;
exports.createOrgUnit = createOrgUnit;
exports.updateOrgUnit = updateOrgUnit;
const mongoose_1 = __importDefault(require("mongoose"));
const org_unit_model_1 = require("./org-unit.model");
const org_unit_types_1 = require("./org-unit.types");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isBooleanOrUndefined(value) {
    return value === undefined || typeof value === "boolean";
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    if (!isNonEmptyString(body.type) || !org_unit_types_1.ORG_UNIT_TYPES.includes(body.type)) {
        return {
            isValid: false,
            message: `Field 'type' must be one of: ${org_unit_types_1.ORG_UNIT_TYPES.join(", ")}.`,
        };
    }
    const status = body.status ?? "active";
    if (!isNonEmptyString(status) || !org_unit_types_1.ORG_UNIT_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${org_unit_types_1.ORG_UNIT_STATUSES.join(", ")}.`,
        };
    }
    if (!body.name || typeof body.name !== "object") {
        return { isValid: false, message: "Field 'name' is required." };
    }
    if (!isNonEmptyString(body.name.ar)) {
        return { isValid: false, message: "Field 'name.ar' is required." };
    }
    if (!isNonEmptyString(body.name.en)) {
        return { isValid: false, message: "Field 'name.en' is required." };
    }
    if (!isNonEmptyString(body.name.de)) {
        return { isValid: false, message: "Field 'name.de' is required." };
    }
    if (body.parentOrgUnitId !== undefined) {
        if (!isNonEmptyString(body.parentOrgUnitId) || !mongoose_1.default.isValidObjectId(body.parentOrgUnitId)) {
            return { isValid: false, message: "Field 'parentOrgUnitId' must be a valid ObjectId." };
        }
    }
    if (body.contactInfo !== undefined && typeof body.contactInfo !== "object") {
        return { isValid: false, message: "Field 'contactInfo' must be an object." };
    }
    if (body.contactInfo?.phone !== undefined && !isNonEmptyString(body.contactInfo.phone)) {
        return { isValid: false, message: "Field 'contactInfo.phone' must be a non-empty string." };
    }
    if (body.contactInfo?.email !== undefined && !isNonEmptyString(body.contactInfo.email)) {
        return { isValid: false, message: "Field 'contactInfo.email' must be a non-empty string." };
    }
    if (body.contactInfo?.address !== undefined && !isNonEmptyString(body.contactInfo.address)) {
        return { isValid: false, message: "Field 'contactInfo.address' must be a non-empty string." };
    }
    if (body.settings !== undefined && typeof body.settings !== "object") {
        return { isValid: false, message: "Field 'settings' must be an object." };
    }
    if (!isBooleanOrUndefined(body.settings?.registeredUsersOnly)) {
        return {
            isValid: false,
            message: "Field 'settings.registeredUsersOnly' must be boolean.",
        };
    }
    if (!isBooleanOrUndefined(body.settings?.insuranceQuarterValidation)) {
        return {
            isValid: false,
            message: "Field 'settings.insuranceQuarterValidation' must be boolean.",
        };
    }
    return {
        isValid: true,
        data: {
            code: body.code.trim().toUpperCase(),
            type: body.type,
            status: status,
            name: {
                ar: body.name.ar.trim(),
                en: body.name.en.trim(),
                de: body.name.de.trim(),
            },
            parentOrgUnitId: body.parentOrgUnitId
                ? new mongoose_1.default.Types.ObjectId(body.parentOrgUnitId)
                : undefined,
            contactInfo: body.contactInfo
                ? {
                    phone: body.contactInfo.phone?.trim(),
                    email: body.contactInfo.email?.trim().toLowerCase(),
                    address: body.contactInfo.address?.trim(),
                }
                : undefined,
            settings: {
                registeredUsersOnly: body.settings?.registeredUsersOnly ?? false,
                insuranceQuarterValidation: body.settings?.insuranceQuarterValidation ?? false,
            },
        },
    };
}
async function getOrgUnits(_req, res, next) {
    try {
        const orgUnits = await org_unit_model_1.OrgUnitModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: orgUnits,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getOrgUnitById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid org unit id.",
            });
            return;
        }
        const orgUnit = await org_unit_model_1.OrgUnitModel.findById(id).lean();
        if (!orgUnit) {
            res.status(404).json({
                success: false,
                message: "Org unit not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: orgUnit,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createOrgUnit(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const { code, parentOrgUnitId } = parsed.data;
        const existingOrgUnit = await org_unit_model_1.OrgUnitModel.findOne({ code }).select("_id").lean();
        if (existingOrgUnit) {
            res.status(409).json({
                success: false,
                message: "Org unit code already exists.",
            });
            return;
        }
        if (parentOrgUnitId) {
            const parentOrgUnitExists = await org_unit_model_1.OrgUnitModel.exists({ _id: parentOrgUnitId });
            if (!parentOrgUnitExists) {
                res.status(400).json({
                    success: false,
                    message: "parentOrgUnitId does not reference an existing org unit.",
                });
                return;
            }
        }
        const orgUnit = await org_unit_model_1.OrgUnitModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: orgUnit,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Org unit code already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateOrgUnit(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid org unit id.",
            });
            return;
        }
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        if (parsed.data.parentOrgUnitId && parsed.data.parentOrgUnitId.toString() === id) {
            res.status(400).json({
                success: false,
                message: "parentOrgUnitId cannot reference the same org unit.",
            });
            return;
        }
        const existingOrgUnit = await org_unit_model_1.OrgUnitModel.findById(id);
        if (!existingOrgUnit) {
            res.status(404).json({
                success: false,
                message: "Org unit not found.",
            });
            return;
        }
        const duplicateByCode = await org_unit_model_1.OrgUnitModel.findOne({
            code: parsed.data.code,
            _id: { $ne: existingOrgUnit._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Org unit code already exists.",
            });
            return;
        }
        if (parsed.data.parentOrgUnitId) {
            const parentOrgUnitExists = await org_unit_model_1.OrgUnitModel.exists({ _id: parsed.data.parentOrgUnitId });
            if (!parentOrgUnitExists) {
                res.status(400).json({
                    success: false,
                    message: "parentOrgUnitId does not reference an existing org unit.",
                });
                return;
            }
        }
        existingOrgUnit.code = parsed.data.code;
        existingOrgUnit.type = parsed.data.type;
        existingOrgUnit.status = parsed.data.status;
        existingOrgUnit.name = parsed.data.name;
        existingOrgUnit.parentOrgUnitId = parsed.data.parentOrgUnitId ?? null;
        existingOrgUnit.contactInfo = parsed.data.contactInfo;
        existingOrgUnit.settings = parsed.data.settings;
        const updatedOrgUnit = await existingOrgUnit.save();
        res.status(200).json({
            success: true,
            data: updatedOrgUnit,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Org unit code already exists.",
            });
            return;
        }
        next(error);
    }
}
