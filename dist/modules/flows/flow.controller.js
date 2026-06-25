"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFlows = getFlows;
exports.getFlowById = getFlowById;
exports.createFlow = createFlow;
exports.updateFlow = updateFlow;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const request_type_model_1 = require("../request-types/request-type.model");
const service_model_1 = require("../services/service.model");
const flow_model_1 = require("./flow.model");
const flow_types_1 = require("./flow.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isBooleanOrUndefined(value) {
    return value === undefined || typeof value === "boolean";
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function parseStringArray(value, fieldName) {
    if (value === undefined) {
        return { isValid: true };
    }
    if (!Array.isArray(value)) {
        return {
            isValid: false,
            message: `Field '${fieldName}' must be an array of non-empty strings.`,
        };
    }
    const invalidEntry = value.find((item) => !isNonEmptyString(item));
    if (invalidEntry !== undefined) {
        return {
            isValid: false,
            message: `Field '${fieldName}' must be an array of non-empty strings.`,
        };
    }
    const cleaned = value
        .map((item) => item.trim())
        .filter((item, index, arr) => arr.indexOf(item) === index);
    return { isValid: true, data: cleaned };
}
function parseOptionalObjectId(value, fieldName) {
    if (value === undefined) {
        return { isValid: true };
    }
    if (!isNonEmptyString(value) || !mongoose_1.default.isValidObjectId(value)) {
        return {
            isValid: false,
            message: `Field '${fieldName}' must be a valid ObjectId.`,
        };
    }
    return { isValid: true, data: new mongoose_1.default.Types.ObjectId(value) };
}
function parseServiceRequestRouting(value) {
    if (value === undefined) {
        return { isValid: true };
    }
    if (!Array.isArray(value)) {
        return {
            isValid: false,
            message: "Field 'settings.serviceRequestRouting' must be an array.",
        };
    }
    const routes = [];
    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        const fieldPrefix = `settings.serviceRequestRouting[${index}]`;
        if (!isPlainObject(item)) {
            return {
                isValid: false,
                message: `Field '${fieldPrefix}' must be an object.`,
            };
        }
        if (item.whenDataKey !== undefined && !isNonEmptyString(item.whenDataKey)) {
            return {
                isValid: false,
                message: `Field '${fieldPrefix}.whenDataKey' must be a non-empty string when provided.`,
            };
        }
        if (item.equals !== undefined && !isNonEmptyString(item.equals)) {
            return {
                isValid: false,
                message: `Field '${fieldPrefix}.equals' must be a non-empty string when provided.`,
            };
        }
        const serviceIdResult = parseOptionalObjectId(item.serviceId, `${fieldPrefix}.serviceId`);
        if (!serviceIdResult.isValid) {
            return { isValid: false, message: serviceIdResult.message };
        }
        const requestTypeIdResult = parseOptionalObjectId(item.requestTypeId, `${fieldPrefix}.requestTypeId`);
        if (!requestTypeIdResult.isValid) {
            return { isValid: false, message: requestTypeIdResult.message };
        }
        if (!serviceIdResult.data || !requestTypeIdResult.data) {
            return {
                isValid: false,
                message: `Fields '${fieldPrefix}.serviceId' and '${fieldPrefix}.requestTypeId' are required.`,
            };
        }
        routes.push({
            whenDataKey: isNonEmptyString(item.whenDataKey) ? item.whenDataKey.trim() : undefined,
            equals: isNonEmptyString(item.equals) ? item.equals.trim() : undefined,
            serviceId: serviceIdResult.data,
            requestTypeId: requestTypeIdResult.data,
        });
    }
    return { isValid: true, data: routes };
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    if (!isNonEmptyString(body.name)) {
        return { isValid: false, message: "Field 'name' is required." };
    }
    if (!isPositiveNumber(body.version)) {
        return { isValid: false, message: "Field 'version' is required and must be a positive number." };
    }
    if (!isNonEmptyString(body.startStepCode)) {
        return { isValid: false, message: "Field 'startStepCode' is required." };
    }
    if (!isNonEmptyString(body.status) || !flow_types_1.FLOW_STATUSES.includes(body.status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${flow_types_1.FLOW_STATUSES.join(", ")}.`,
        };
    }
    if (body.appliesTo !== undefined && !isPlainObject(body.appliesTo)) {
        return { isValid: false, message: "Field 'appliesTo' must be an object." };
    }
    const channelCodesResult = parseStringArray(body.appliesTo?.channelCodes, "appliesTo.channelCodes");
    if (!channelCodesResult.isValid) {
        return { isValid: false, message: channelCodesResult.message };
    }
    const orgUnitTypesResult = parseStringArray(body.appliesTo?.orgUnitTypes, "appliesTo.orgUnitTypes");
    if (!orgUnitTypesResult.isValid) {
        return { isValid: false, message: orgUnitTypesResult.message };
    }
    if (body.settings !== undefined && !isPlainObject(body.settings)) {
        return { isValid: false, message: "Field 'settings' must be an object." };
    }
    if (!isBooleanOrUndefined(body.settings?.allowResume)) {
        return { isValid: false, message: "Field 'settings.allowResume' must be boolean." };
    }
    if (body.settings?.sessionTimeoutMinutes !== undefined &&
        !isPositiveNumber(body.settings.sessionTimeoutMinutes)) {
        return {
            isValid: false,
            message: "Field 'settings.sessionTimeoutMinutes' must be a positive number.",
        };
    }
    if (!isBooleanOrUndefined(body.settings?.createServiceRequestOnCompletion)) {
        return {
            isValid: false,
            message: "Field 'settings.createServiceRequestOnCompletion' must be boolean.",
        };
    }
    const serviceIdResult = parseOptionalObjectId(body.settings?.serviceId, "settings.serviceId");
    if (!serviceIdResult.isValid) {
        return { isValid: false, message: serviceIdResult.message };
    }
    const requestTypeIdResult = parseOptionalObjectId(body.settings?.requestTypeId, "settings.requestTypeId");
    if (!requestTypeIdResult.isValid) {
        return { isValid: false, message: requestTypeIdResult.message };
    }
    const serviceRequestRoutingResult = parseServiceRequestRouting(body.settings?.serviceRequestRouting);
    if (!serviceRequestRoutingResult.isValid) {
        return { isValid: false, message: serviceRequestRoutingResult.message };
    }
    if (body.settings?.createServiceRequestOnCompletion === true) {
        if (!serviceIdResult.data) {
            return {
                isValid: false,
                message: "Field 'settings.serviceId' is required when createServiceRequestOnCompletion is true.",
            };
        }
        if (!requestTypeIdResult.data) {
            return {
                isValid: false,
                message: "Field 'settings.requestTypeId' is required when createServiceRequestOnCompletion is true.",
            };
        }
    }
    const appliesTo = body.appliesTo && (channelCodesResult.data || orgUnitTypesResult.data)
        ? {
            channelCodes: channelCodesResult.data,
            orgUnitTypes: orgUnitTypesResult.data,
        }
        : undefined;
    const settings = body.settings &&
        (body.settings.allowResume !== undefined ||
            body.settings.sessionTimeoutMinutes !== undefined ||
            body.settings.createServiceRequestOnCompletion !== undefined ||
            serviceIdResult.data !== undefined ||
            requestTypeIdResult.data !== undefined ||
            serviceRequestRoutingResult.data !== undefined)
        ? {
            allowResume: body.settings.allowResume,
            sessionTimeoutMinutes: body.settings.sessionTimeoutMinutes,
            createServiceRequestOnCompletion: body.settings.createServiceRequestOnCompletion,
            serviceId: serviceIdResult.data,
            requestTypeId: requestTypeIdResult.data,
            serviceRequestRouting: serviceRequestRoutingResult.data,
        }
        : undefined;
    return {
        isValid: true,
        data: {
            code: body.code.trim().toUpperCase(),
            name: body.name.trim(),
            version: body.version,
            status: body.status,
            startStepCode: body.startStepCode.trim(),
            appliesTo,
            settings,
        },
    };
}
async function getFlows(req, res, next) {
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
            res.status(200).json({
                success: true,
                data: [
                    {
                        _id: scopedFlow._id,
                        code: scopedFlow.code,
                        version: scopedFlow.version,
                    },
                ],
            });
            return;
        }
        const flows = await flow_model_1.FlowModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: flows,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getFlowById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid flow id.",
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
            if (String(scopedFlow._id) !== id) {
                res.status(404).json({
                    success: false,
                    message: "Flow not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: {
                    _id: scopedFlow._id,
                    code: scopedFlow.code,
                    version: scopedFlow.version,
                },
            });
            return;
        }
        const flow = await flow_model_1.FlowModel.findById(id).lean();
        if (!flow) {
            res.status(404).json({
                success: false,
                message: "Flow not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: flow,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createFlow(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        if (parsed.data.settings?.createServiceRequestOnCompletion === true) {
            const { serviceId, requestTypeId } = parsed.data.settings;
            if (!serviceId || !requestTypeId) {
                res.status(400).json({
                    success: false,
                    message: "settings.serviceId and settings.requestTypeId are required when createServiceRequestOnCompletion is true.",
                });
                return;
            }
            const [serviceExists, requestTypeExists] = await Promise.all([
                service_model_1.ServiceModel.exists({ _id: serviceId }),
                request_type_model_1.RequestTypeModel.exists({ _id: requestTypeId }),
            ]);
            if (!serviceExists) {
                res.status(400).json({
                    success: false,
                    message: "settings.serviceId does not reference an existing service.",
                });
                return;
            }
            if (!requestTypeExists) {
                res.status(400).json({
                    success: false,
                    message: "settings.requestTypeId does not reference an existing request type.",
                });
                return;
            }
        }
        if (parsed.data.settings?.serviceRequestRouting?.length) {
            const referencedServiceIds = [
                ...new Set(parsed.data.settings.serviceRequestRouting.map((route) => String(route.serviceId))),
            ];
            const referencedRequestTypeIds = [
                ...new Set(parsed.data.settings.serviceRequestRouting.map((route) => String(route.requestTypeId))),
            ];
            const [existingServices, existingRequestTypes] = await Promise.all([
                service_model_1.ServiceModel.find({ _id: { $in: referencedServiceIds } }).select("_id").lean(),
                request_type_model_1.RequestTypeModel.find({ _id: { $in: referencedRequestTypeIds } }).select("_id").lean(),
            ]);
            if (existingServices.length !== referencedServiceIds.length) {
                res.status(400).json({
                    success: false,
                    message: "One or more settings.serviceRequestRouting serviceId values are invalid.",
                });
                return;
            }
            if (existingRequestTypes.length !== referencedRequestTypeIds.length) {
                res.status(400).json({
                    success: false,
                    message: "One or more settings.serviceRequestRouting requestTypeId values are invalid.",
                });
                return;
            }
        }
        const existingFlow = await flow_model_1.FlowModel.findOne({
            code: parsed.data.code,
            version: parsed.data.version,
        })
            .select("_id")
            .lean();
        if (existingFlow) {
            res.status(409).json({
                success: false,
                message: "Flow with this code and version already exists.",
            });
            return;
        }
        const flow = await flow_model_1.FlowModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: flow,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Flow with this code and version already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateFlow(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid flow id.",
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
        const existingFlow = await flow_model_1.FlowModel.findById(id);
        if (!existingFlow) {
            res.status(404).json({
                success: false,
                message: "Flow not found.",
            });
            return;
        }
        if (parsed.data.settings?.createServiceRequestOnCompletion === true) {
            const { serviceId, requestTypeId } = parsed.data.settings;
            if (!serviceId || !requestTypeId) {
                res.status(400).json({
                    success: false,
                    message: "settings.serviceId and settings.requestTypeId are required when createServiceRequestOnCompletion is true.",
                });
                return;
            }
            const [serviceExists, requestTypeExists] = await Promise.all([
                service_model_1.ServiceModel.exists({ _id: serviceId }),
                request_type_model_1.RequestTypeModel.exists({ _id: requestTypeId }),
            ]);
            if (!serviceExists) {
                res.status(400).json({
                    success: false,
                    message: "settings.serviceId does not reference an existing service.",
                });
                return;
            }
            if (!requestTypeExists) {
                res.status(400).json({
                    success: false,
                    message: "settings.requestTypeId does not reference an existing request type.",
                });
                return;
            }
        }
        if (parsed.data.settings?.serviceRequestRouting?.length) {
            const referencedServiceIds = [
                ...new Set(parsed.data.settings.serviceRequestRouting.map((route) => String(route.serviceId))),
            ];
            const referencedRequestTypeIds = [
                ...new Set(parsed.data.settings.serviceRequestRouting.map((route) => String(route.requestTypeId))),
            ];
            const [existingServices, existingRequestTypes] = await Promise.all([
                service_model_1.ServiceModel.find({ _id: { $in: referencedServiceIds } }).select("_id").lean(),
                request_type_model_1.RequestTypeModel.find({ _id: { $in: referencedRequestTypeIds } }).select("_id").lean(),
            ]);
            if (existingServices.length !== referencedServiceIds.length) {
                res.status(400).json({
                    success: false,
                    message: "One or more settings.serviceRequestRouting serviceId values are invalid.",
                });
                return;
            }
            if (existingRequestTypes.length !== referencedRequestTypeIds.length) {
                res.status(400).json({
                    success: false,
                    message: "One or more settings.serviceRequestRouting requestTypeId values are invalid.",
                });
                return;
            }
        }
        const duplicateByCodeVersion = await flow_model_1.FlowModel.findOne({
            code: parsed.data.code,
            version: parsed.data.version,
            _id: { $ne: existingFlow._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCodeVersion) {
            res.status(409).json({
                success: false,
                message: "Flow with this code and version already exists.",
            });
            return;
        }
        existingFlow.code = parsed.data.code;
        existingFlow.name = parsed.data.name;
        existingFlow.version = parsed.data.version;
        existingFlow.status = parsed.data.status;
        existingFlow.startStepCode = parsed.data.startStepCode;
        existingFlow.appliesTo = parsed.data.appliesTo;
        existingFlow.settings = parsed.data.settings;
        const updatedFlow = await existingFlow.save();
        res.status(200).json({
            success: true,
            data: updatedFlow,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Flow with this code and version already exists.",
            });
            return;
        }
        next(error);
    }
}
