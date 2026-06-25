"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_scope_1 = require("../../modules/auth/auth.scope");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const baileys_service_1 = require("./baileys.service");
const router = (0, express_1.Router)();
async function enforceChannelAccountScope(req, res) {
    if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        return true;
    }
    const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
    if (!scopedChannelAccount) {
        (0, apiResponse_1.sendError)(res, "Client channel account scope is not configured.", 403);
        return false;
    }
    if (!(0, auth_scope_1.idsMatch)(scopedChannelAccount._id, req.params.channelAccountId)) {
        (0, apiResponse_1.sendError)(res, "Channel account not found.", 404);
        return false;
    }
    return true;
}
router.post("/start/:channelAccountId", async (req, res, next) => {
    try {
        if (!(await enforceChannelAccountScope(req, res))) {
            return;
        }
        const result = await (0, baileys_service_1.startBaileys)(req.params.channelAccountId);
        (0, apiResponse_1.sendSuccess)(res, { data: result });
    }
    catch (error) {
        if ((0, baileys_service_1.isBaileysIntegrationError)(error)) {
            (0, apiResponse_1.sendError)(res, error.message, error.statusCode);
            return;
        }
        next(error);
    }
});
router.get("/status/:channelAccountId", (req, res, next) => {
    (async () => {
        try {
            if (!(await enforceChannelAccountScope(req, res))) {
                return;
            }
            const result = (0, baileys_service_1.getBaileysStatus)(req.params.channelAccountId);
            (0, apiResponse_1.sendSuccess)(res, { data: result });
        }
        catch (error) {
            if ((0, baileys_service_1.isBaileysIntegrationError)(error)) {
                (0, apiResponse_1.sendError)(res, error.message, error.statusCode);
                return;
            }
            next(error);
        }
    })();
});
router.get("/qr/:channelAccountId", (req, res, next) => {
    (async () => {
        try {
            if (!(await enforceChannelAccountScope(req, res))) {
                return;
            }
            const result = (0, baileys_service_1.getBaileysQr)(req.params.channelAccountId);
            if (result.qr) {
                (0, apiResponse_1.sendSuccess)(res, { data: result });
                return;
            }
            (0, apiResponse_1.sendSuccess)(res, {
                data: result,
                message: "No QR is currently available for this channel account.",
            });
        }
        catch (error) {
            if ((0, baileys_service_1.isBaileysIntegrationError)(error)) {
                (0, apiResponse_1.sendError)(res, error.message, error.statusCode);
                return;
            }
            next(error);
        }
    })();
});
router.post("/logout/:channelAccountId", async (req, res, next) => {
    try {
        if (!(await enforceChannelAccountScope(req, res))) {
            return;
        }
        const result = await (0, baileys_service_1.logoutBaileys)(req.params.channelAccountId);
        (0, apiResponse_1.sendSuccess)(res, { data: result });
    }
    catch (error) {
        if ((0, baileys_service_1.isBaileysIntegrationError)(error)) {
            (0, apiResponse_1.sendError)(res, error.message, error.statusCode);
            return;
        }
        next(error);
    }
});
exports.default = router;
