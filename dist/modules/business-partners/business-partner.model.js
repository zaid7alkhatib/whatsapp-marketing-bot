"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessPartnerModel = void 0;
const mongoose_1 = require("mongoose");
const business_partner_types_1 = require("./business-partner.types");
const namesSchema = new mongoose_1.Schema({
    fullName: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    firstName: { type: String, trim: true, maxlength: 100 },
    lastName: { type: String, trim: true, maxlength: 100 },
}, { _id: false });
const personalInfoSchema = new mongoose_1.Schema({
    dateOfBirth: { type: Date, required: false },
    gender: { type: String, trim: true, required: false },
}, { _id: false });
const contactInfoSchema = new mongoose_1.Schema({
    phone: { type: String, trim: true, required: false },
    email: { type: String, trim: true, lowercase: true, required: false },
}, { _id: false });
const identifiersSchema = new mongoose_1.Schema({
    externalRef: { type: String, trim: true, required: false },
    insuranceNumber: { type: String, trim: true, required: false },
    patientNumber: { type: String, trim: true, required: false },
}, { _id: false });
const businessPartnerSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: business_partner_types_1.BUSINESS_PARTNER_TYPES,
        required: true,
    },
    subtype: {
        type: String,
        enum: business_partner_types_1.BUSINESS_PARTNER_SUBTYPES,
        required: true,
    },
    status: {
        type: String,
        enum: business_partner_types_1.BUSINESS_PARTNER_STATUSES,
        default: "active",
        required: true,
    },
    names: {
        type: namesSchema,
        required: true,
    },
    personalInfo: {
        type: personalInfoSchema,
        required: false,
    },
    contactInfo: {
        type: contactInfoSchema,
        required: false,
    },
    preferredLanguage: {
        type: String,
        trim: true,
        required: false,
    },
    identifiers: {
        type: identifiersSchema,
        required: false,
    },
    tags: {
        type: [String],
        default: undefined,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
businessPartnerSchema.index({ "contactInfo.phone": 1 });
businessPartnerSchema.index({ "contactInfo.email": 1 });
businessPartnerSchema.index({ "identifiers.patientNumber": 1 }, { sparse: true });
businessPartnerSchema.index({ type: 1, subtype: 1, status: 1 });
exports.BusinessPartnerModel = (0, mongoose_1.model)("BusinessPartner", businessPartnerSchema);
