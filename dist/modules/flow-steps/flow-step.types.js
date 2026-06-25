"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLOW_STEP_STATUSES = exports.FLOW_STEP_TYPES = void 0;
exports.FLOW_STEP_TYPES = [
    "message",
    "choice",
    "input_text",
    "input_number",
    "input_date",
    "input_phone",
    "multi_field_form",
    "condition",
    "api_action",
    "ai_extract",
    "handoff",
    "end",
];
exports.FLOW_STEP_STATUSES = ["active", "inactive"];
