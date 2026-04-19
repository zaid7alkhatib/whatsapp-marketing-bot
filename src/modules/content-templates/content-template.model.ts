import { Document, Schema, model } from "mongoose";
import {
  CONTENT_TEMPLATE_SCOPES,
  CONTENT_TEMPLATE_STATUSES,
  CONTENT_TEMPLATE_TYPES,
  ContentTemplate,
  ContentTemplateTranslations,
} from "./content-template.types";

export interface ContentTemplateDocument extends ContentTemplate, Document {}

const translationsSchema = new Schema<ContentTemplateTranslations>(
  {
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const contentTemplateSchema = new Schema<ContentTemplateDocument>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
      unique: true,
    },
    contentType: {
      type: String,
      enum: CONTENT_TEMPLATE_TYPES,
      required: true,
    },
    scope: {
      type: String,
      enum: CONTENT_TEMPLATE_SCOPES,
      required: true,
    },
    translations: {
      type: translationsSchema,
      required: true,
    },
    placeholders: {
      type: [String],
      default: undefined,
      required: false,
    },
    status: {
      type: String,
      enum: CONTENT_TEMPLATE_STATUSES,
      default: "active",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

contentTemplateSchema.index({ contentType: 1, scope: 1, status: 1 });

export const ContentTemplateModel = model<ContentTemplateDocument>(
  "ContentTemplate",
  contentTemplateSchema
);
