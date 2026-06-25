"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrgUnitModel = void 0;
const mongoose_1 = require("mongoose");
const org_unit_types_1 = require("./org-unit.types");
const localizedNameSchema = new mongoose_1.Schema({
    ar: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },
    de: { type: String, required: true, trim: true },
}, { _id: false });
const contactInfoSchema = new mongoose_1.Schema({
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
}, { _id: false });
const settingsSchema = new mongoose_1.Schema({
    registeredUsersOnly: { type: Boolean, default: false },
    insuranceQuarterValidation: { type: Boolean, default: false },
}, { _id: false });
const orgUnitSchema = new mongoose_1.Schema({
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 50,
        unique: true,
    },
    type: {
        type: String,
        enum: org_unit_types_1.ORG_UNIT_TYPES,
        required: true,
    },
    status: {
        type: String,
        enum: org_unit_types_1.ORG_UNIT_STATUSES,
        default: "active",
        required: true,
    },
    name: {
        type: localizedNameSchema,
        required: true,
    },
    parentOrgUnitId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "OrgUnit",
        default: null,
    },
    contactInfo: {
        type: contactInfoSchema,
        required: false,
    },
    settings: {
        type: settingsSchema,
        default: () => ({
            registeredUsersOnly: false,
            insuranceQuarterValidation: false,
        }),
    },
}, {
    timestamps: true,
    versionKey: false,
});
orgUnitSchema.index({ type: 1, status: 1 });
exports.OrgUnitModel = (0, mongoose_1.model)("OrgUnit", orgUnitSchema);
