"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFlowSteps = getFlowSteps;
exports.getFlowStepById = getFlowStepById;
exports.createFlowStep = createFlowStep;
exports.updateFlowStep = updateFlowStep;
exports.deleteFlowStep = deleteFlowStep;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const flow_model_1 = require("../flows/flow.model");
const flow_step_model_1 = require("./flow-step.model");
const flow_step_types_1 = require("./flow-step.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function getTransitionTarget(value) {
    if (!isPlainObject(value)) {
        return undefined;
    }
    if (isNonEmptyString(value.nextStepCode)) {
        return value.nextStepCode.trim();
    }
    if (isNonEmptyString(value.toStepCode)) {
        return value.toStepCode.trim();
    }
    return undefined;
}
function getReferencingStepCodes(steps, targetStepCode) {
    return steps
        .filter((step) => {
        if (!Array.isArray(step.transitionConfig)) {
            return false;
        }
        return step.transitionConfig.some((transition) => getTransitionTarget(transition) === targetStepCode);
    })
        .map((step) => step.code);
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.flowId) || !mongoose_1.default.isValidObjectId(body.flowId)) {
        return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    if (!isNonEmptyString(body.type) || !flow_step_types_1.FLOW_STEP_TYPES.includes(body.type)) {
        return {
            isValid: false,
            message: `Field 'type' must be one of: ${flow_step_types_1.FLOW_STEP_TYPES.join(", ")}.`,
        };
    }
    if (!isPositiveNumber(body.sequence)) {
        return { isValid: false, message: "Field 'sequence' is required and must be a positive number." };
    }
    if (!isNonEmptyString(body.status) || !flow_step_types_1.FLOW_STEP_STATUSES.includes(body.status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${flow_step_types_1.FLOW_STEP_STATUSES.join(", ")}.`,
        };
    }
    if (body.contentKey !== undefined && !isNonEmptyString(body.contentKey)) {
        return { isValid: false, message: "Field 'contentKey' must be a non-empty string." };
    }
    if (body.stepConfig !== undefined && !isPlainObject(body.stepConfig)) {
        return { isValid: false, message: "Field 'stepConfig' must be an object." };
    }
    if (isPlainObject(body.stepConfig) &&
        body.stepConfig.dataKey !== undefined &&
        !isNonEmptyString(body.stepConfig.dataKey)) {
        return { isValid: false, message: "Field 'stepConfig.dataKey' must be a non-empty string." };
    }
    if (body.validationConfig !== undefined && !isPlainObject(body.validationConfig)) {
        return { isValid: false, message: "Field 'validationConfig' must be an object." };
    }
    if (body.transitionConfig !== undefined && !Array.isArray(body.transitionConfig)) {
        return { isValid: false, message: "Field 'transitionConfig' must be an array." };
    }
    if (body.aiConfig !== undefined && !isPlainObject(body.aiConfig)) {
        return { isValid: false, message: "Field 'aiConfig' must be an object." };
    }
    if (body.actionConfig !== undefined && !isPlainObject(body.actionConfig)) {
        return { isValid: false, message: "Field 'actionConfig' must be an object." };
    }
    if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
        return { isValid: false, message: "Field 'metadata' must be an object." };
    }
    return {
        isValid: true,
        data: {
            flowId: new mongoose_1.default.Types.ObjectId(body.flowId),
            code: body.code.trim().toUpperCase(),
            type: body.type,
            sequence: body.sequence,
            status: body.status,
            contentKey: body.contentKey?.trim(),
            stepConfig: body.stepConfig
                ? {
                    ...body.stepConfig,
                    dataKey: isNonEmptyString(body.stepConfig.dataKey)
                        ? body.stepConfig.dataKey.trim()
                        : undefined,
                }
                : undefined,
            validationConfig: body.validationConfig,
            transitionConfig: body.transitionConfig,
            aiConfig: body.aiConfig,
            actionConfig: body.actionConfig,
            metadata: body.metadata,
        },
    };
}
async function getFlowSteps(req, res, next) {
    try {
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(req.authUser);
            if (!scopedFlow) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            const flowSteps = await flow_step_model_1.FlowStepModel.find({ flowId: scopedFlow._id })
                .sort({ sequence: 1, createdAt: 1 })
                .lean();
            res.status(200).json({
                success: true,
                data: flowSteps,
            });
            return;
        }
        const flowSteps = await flow_step_model_1.FlowStepModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: flowSteps,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getFlowStepById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid flow step id.",
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(req.authUser);
            if (!scopedFlow) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            const flowStep = await flow_step_model_1.FlowStepModel.findOne({ _id: id, flowId: scopedFlow._id }).lean();
            if (!flowStep) {
                res.status(404).json({
                    success: false,
                    message: "Flow step not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: flowStep,
            });
            return;
        }
        const flowStep = await flow_step_model_1.FlowStepModel.findById(id).lean();
        if (!flowStep) {
            res.status(404).json({
                success: false,
                message: "Flow step not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: flowStep,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createFlowStep(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(req.authUser);
            if (!scopedFlow) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            if (!(0, auth_scope_1.idsMatch)(parsed.data.flowId, scopedFlow._id)) {
                res.status(403).json({
                    success: false,
                    message: "You can only create flow steps inside the scoped client flow.",
                });
                return;
            }
        }
        const flowExists = await flow_model_1.FlowModel.exists({ _id: parsed.data.flowId });
        if (!flowExists) {
            res.status(400).json({
                success: false,
                message: "flowId does not reference an existing flow.",
            });
            return;
        }
        const existingByCode = await flow_step_model_1.FlowStepModel.findOne({
            flowId: parsed.data.flowId,
            code: parsed.data.code,
        })
            .select("_id")
            .lean();
        if (existingByCode) {
            res.status(409).json({
                success: false,
                message: "Flow step code already exists in this flow.",
            });
            return;
        }
        const existingBySequence = await flow_step_model_1.FlowStepModel.findOne({
            flowId: parsed.data.flowId,
            sequence: parsed.data.sequence,
        })
            .select("_id")
            .lean();
        if (existingBySequence) {
            res.status(409).json({
                success: false,
                message: "Flow step sequence already exists in this flow.",
            });
            return;
        }
        const flowStep = await flow_step_model_1.FlowStepModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: flowStep,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Flow step with this code or sequence already exists in this flow.",
            });
            return;
        }
        next(error);
    }
}
async function updateFlowStep(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid flow step id.",
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
        const existingFlowStep = await flow_step_model_1.FlowStepModel.findById(id);
        if (!existingFlowStep) {
            res.status(404).json({
                success: false,
                message: "Flow step not found.",
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(req.authUser);
            if (!scopedFlow) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            if (!(0, auth_scope_1.idsMatch)(existingFlowStep.flowId, scopedFlow._id) ||
                !(0, auth_scope_1.idsMatch)(parsed.data.flowId, scopedFlow._id)) {
                res.status(403).json({
                    success: false,
                    message: "You can only update flow steps inside the scoped client flow.",
                });
                return;
            }
        }
        const flowExists = await flow_model_1.FlowModel.exists({ _id: parsed.data.flowId });
        if (!flowExists) {
            res.status(400).json({
                success: false,
                message: "flowId does not reference an existing flow.",
            });
            return;
        }
        const duplicateByCode = await flow_step_model_1.FlowStepModel.findOne({
            flowId: parsed.data.flowId,
            code: parsed.data.code,
            _id: { $ne: existingFlowStep._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Flow step code already exists in this flow.",
            });
            return;
        }
        const duplicateBySequence = await flow_step_model_1.FlowStepModel.findOne({
            flowId: parsed.data.flowId,
            sequence: parsed.data.sequence,
            _id: { $ne: existingFlowStep._id },
        })
            .select("_id")
            .lean();
        if (duplicateBySequence) {
            res.status(409).json({
                success: false,
                message: "Flow step sequence already exists in this flow.",
            });
            return;
        }
        existingFlowStep.flowId = parsed.data.flowId;
        existingFlowStep.code = parsed.data.code;
        existingFlowStep.type = parsed.data.type;
        existingFlowStep.sequence = parsed.data.sequence;
        existingFlowStep.status = parsed.data.status;
        existingFlowStep.contentKey = parsed.data.contentKey;
        existingFlowStep.stepConfig = parsed.data.stepConfig;
        existingFlowStep.validationConfig = parsed.data.validationConfig;
        existingFlowStep.transitionConfig = parsed.data.transitionConfig;
        existingFlowStep.aiConfig = parsed.data.aiConfig;
        existingFlowStep.actionConfig = parsed.data.actionConfig;
        existingFlowStep.metadata = parsed.data.metadata;
        const updatedFlowStep = await existingFlowStep.save();
        res.status(200).json({
            success: true,
            data: updatedFlowStep,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Flow step with this code or sequence already exists in this flow.",
            });
            return;
        }
        next(error);
    }
}
async function deleteFlowStep(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid flow step id.",
            });
            return;
        }
        const existingFlowStep = await flow_step_model_1.FlowStepModel.findById(id);
        if (!existingFlowStep) {
            res.status(404).json({
                success: false,
                message: "Flow step not found.",
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(req.authUser);
            if (!scopedFlow) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            if (!(0, auth_scope_1.idsMatch)(existingFlowStep.flowId, scopedFlow._id)) {
                res.status(403).json({
                    success: false,
                    message: "You can only delete flow steps inside the scoped client flow.",
                });
                return;
            }
        }
        const parentFlow = await flow_model_1.FlowModel.findById(existingFlowStep.flowId)
            .select("startStepCode")
            .lean();
        if (parentFlow?.startStepCode === existingFlowStep.code) {
            res.status(409).json({
                success: false,
                message: "This step is the start step for the flow. Change the flow start step first, then delete it.",
            });
            return;
        }
        const siblingSteps = await flow_step_model_1.FlowStepModel.find({
            flowId: existingFlowStep.flowId,
            _id: { $ne: existingFlowStep._id },
        })
            .select("code transitionConfig")
            .lean();
        const referencingStepCodes = getReferencingStepCodes(siblingSteps, existingFlowStep.code);
        if (referencingStepCodes.length > 0) {
            res.status(409).json({
                success: false,
                message: `Cannot delete this step while other steps still route to it: ${referencingStepCodes.join(", ")}.`,
            });
            return;
        }
        await existingFlowStep.deleteOne();
        res.status(200).json({
            success: true,
            message: "Flow step deleted successfully.",
        });
    }
    catch (error) {
        next(error);
    }
}
