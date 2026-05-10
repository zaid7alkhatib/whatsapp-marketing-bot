/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "../auth/AuthContext";

export type ClientLanguage = "en" | "ar" | "de";

type TranslationValue = string;
type TranslationParams = Record<string, string | number>;
type TranslationDictionary = Record<string, TranslationValue>;

type ClientLocaleContextValue = {
  language: ClientLanguage;
  setLanguage: (language: ClientLanguage) => void;
  t: (key: string, params?: TranslationParams) => string;
  isClientUser: boolean;
};

interface ClientLanguageState {
  username: string | undefined;
  language: ClientLanguage;
}

const STORAGE_KEY_PREFIX = "client-locale";
const DEFAULT_LANGUAGE: ClientLanguage = "en";

const translations: Record<ClientLanguage, TranslationDictionary> = {
  en: {
    "language.english": "English",
    "language.arabic": "Arabic",
    "language.german": "German",
    "language.label": "Language",
    "language.default": "Default language",

    "section.overview": "Overview",
    "section.conversationDesign": "Conversation Design",
    "section.operations": "Operations",
    "section.workspaceSetup": "Workspace Setup",
    "section.navigation": "Navigation",

    "nav.dashboard.title": "Dashboard",
    "nav.dashboard.description": "Overview and backend health.",
    "nav.flowMessages.title": "Flow Messages",
    "nav.flowMessages.description": "Edit the visible text people receive in the flow.",
    "nav.flowSteps.title": "Flow Steps",
    "nav.flowSteps.description": "Build and inspect the clinic flow step by step.",
    "nav.serviceRequests.title": "General Requests",
    "nav.serviceRequests.description": "Open unresolved non-appointment requests first.",
    "nav.medicalAppointments.title": "Medical Appointments",
    "nav.medicalAppointments.description": "Open unresolved appointment requests first.",
    "nav.baileys.title": "WhatsApp Pairing",
    "nav.baileys.description": "Baileys connection status and QR pairing.",
    "nav.gemini.title": "Gemini Assistant",
    "nav.gemini.description": "Manage the insurance card OCR prompt and admin AI tools.",

    "sidebar.brand": "Conversational Bot",
    "sidebar.clientTitle": "Client Console",
    "sidebar.clientDescription":
      "Review service requests, manage the clinic WhatsApp flow steps, and pair the approved WhatsApp account.",
    "sidebar.adminTitle": "Admin Console",
    "sidebar.adminDescription":
      "Configure flows, monitor sessions, and validate runtime behavior from one internal workspace.",
    "sidebar.currentMode": "Current Mode",
    "sidebar.clientScopeTitle": "Client-limited workspace",
    "sidebar.clientScopeDescription":
      "Only the scoped flow, the scoped WhatsApp account, and the related service requests are visible.",

    "topbar.clientChip": "Client Workspace",
    "topbar.adminChip": "Internal Console",
    "topbar.metaFallback": "Metadata-driven bot operations and runtime validation.",
    "topbar.logout": "Logout",

    "common.refresh": "Refresh",
    "common.retry": "Retry",
    "common.loading": "Loading...",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.cancel": "Cancel",
    "common.openPage": "Open page",
    "common.clearFilters": "Clear filters",
    "common.notProvided": "Not provided",
    "common.viewAll": "View All",
    "common.notOpened": "Not Opened ({count})",
    "common.all": "All",
    "common.status": "Status",
    "common.language": "Language",
    "common.search": "Search",
    "common.noResults": "No matching results.",
    "common.empty": "No records found.",
    "common.markDone": "Mark as Done",
    "common.done": "Done",
    "common.back": "Back",
    "common.confirm": "Confirm",
    "common.download": "Download",
    "common.openFullImage": "Open full image",
    "common.yes": "Yes",
    "common.no": "No",
    "common.lastUpdated": "Last updated",
    "common.default": "Default",
    "common.customized": "Customized",
    "common.lines": "Lines",
    "common.characters": "Characters",
    "common.showingCount": "Showing {filteredCount} of {totalCount}",
    "common.showingRange": "Showing {startItem}-{endItem} of {totalItems}",
    "common.rows": "Rows",
    "common.pageCount": "Page {currentPage} of {totalPages}",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.refreshing": "Refreshing...",
    "common.saving": "Saving...",
    "common.resetting": "Resetting...",
    "common.starting": "Starting...",
    "common.deleting": "Deleting...",

    "status.active": "Active",
    "status.inactive": "Inactive",
    "status.new": "New",
    "status.completed": "Completed",
    "status.done": "Done",
    "status.pending": "Pending",
    "status.cancelled": "Cancelled",
    "status.rejected": "Rejected",
    "status.draft": "Draft",
    "status.connected": "Connected",
    "status.disconnected": "Disconnected",
    "status.connecting": "Connecting",
    "status.idle": "Idle",
    "status.not_initialized": "Not initialized",

    "dashboard.heroKicker": "Pre-live workspace",
    "dashboard.heroTitle": "Run the clinic WhatsApp flow from a tightly scoped client workspace.",
    "dashboard.heroDescription":
      "Use this workspace to maintain one clinic WhatsApp flow: update message texts, adjust step logic, pair WhatsApp, and track incoming requests.",
    "dashboard.healthTitle": "Backend Health",
    "dashboard.healthOnline": "Online",
    "dashboard.healthOffline": "Offline",
    "dashboard.healthUnknown": "Unknown",
    "dashboard.healthRunning": "Server is running",
    "dashboard.healthUnavailable": "Health check is unavailable right now.",
    "dashboard.healthSource": "Source: {path}. Confirm this first before testing flows or provider connectivity.",
    "dashboard.healthRetry": "Retry health check",
    "dashboard.workflowTitle": "Recommended workflow",
    "dashboard.workflow1": "Edit message text first in Flow Messages.",
    "dashboard.workflow2": "Adjust conversation logic in Flow Steps only when needed.",
    "dashboard.workflow3": "Pair WhatsApp in WhatsApp Pairing before going live.",
    "dashboard.workflow4": "Monitor real outcomes in Service Requests.",
    "dashboard.cardNew": "{count} new",

    "serviceRequests.title": "General Requests",
    "serviceRequests.description":
      "Review non-appointment requests created from the clinic WhatsApp flow.",
    "serviceRequests.allVisible": "All visible requests",
    "serviceRequests.searchPlaceholder": "Search by request, person, phone, or service...",
    "serviceRequests.loading": "Loading requests...",
    "serviceRequests.empty": "No requests are visible in this workspace.",
    "serviceRequests.noMatches": "No requests match the current filters.",
    "serviceRequests.request": "Request",
    "serviceRequests.person": "Person",
    "serviceRequests.phone": "Phone",
    "serviceRequests.clinic": "Clinic",
    "serviceRequests.serviceNeeded": "Service Needed",
    "serviceRequests.status": "Status",
    "serviceRequests.submittedAt": "Submitted At",
    "serviceRequests.language": "Language",
    "serviceRequests.openRequest": "Open Request {reference}",
    "serviceRequests.dateOfBirth": "Date of birth: {value}",
    "serviceRequests.pendingSlot": "Pending slot",

    "medicalAppointments.title": "Medical Appointments",
    "medicalAppointments.description":
      "Review appointment requests and follow up on the requested slots.",
    "medicalAppointments.searchPlaceholder": "Search by request, patient, phone, or slot...",
    "medicalAppointments.loading": "Loading medical appointments...",
    "medicalAppointments.empty": "No medical appointment requests are visible in this workspace.",
    "medicalAppointments.noMatches": "No medical appointments match the current filters.",
    "medicalAppointments.request": "Request",
    "medicalAppointments.patient": "Patient",
    "medicalAppointments.phone": "Phone",
    "medicalAppointments.clinic": "Clinic",
    "medicalAppointments.requestedSlot": "Requested Slot",
    "medicalAppointments.status": "Status",
    "medicalAppointments.submittedAt": "Submitted At",
    "medicalAppointments.openRequest": "Open Appointment {reference}",
    "medicalAppointments.dateLabel": "Date",
    "medicalAppointments.timeLabel": "Time",
    "medicalAppointments.pendingSlot": "Pending slot",
    "medicalAppointments.slotJoiner": " at ",

    "requestDetail.backToRequests": "Back to Service Requests",
    "requestDetail.backToAppointments": "Back to Medical Appointments",
    "requestDetail.description": "Formatted clinic request details for the client workspace.",
    "requestDetail.loading": "Loading request details...",
    "requestDetail.notFound": "The requested record could not be found in this workspace.",
    "requestDetail.markDoneSuccess": "Request marked as done.",
    "requestDetail.summary": "Request Summary",
    "requestDetail.requestNumber": "Request Number",
    "requestDetail.serviceNeeded": "Service Needed",
    "requestDetail.serviceArea": "Service Area",
    "requestDetail.priority": "Priority",
    "requestDetail.personDetails": "Person Details",
    "requestDetail.fullName": "Full Name",
    "requestDetail.phoneNumber": "Phone Number",
    "requestDetail.email": "Email",
    "requestDetail.dateOfBirth": "Date of Birth",
    "requestDetail.submittedInformation": "Submitted Information",
    "requestDetail.medicalDocuments": "Medical Documents",
    "requestDetail.insuranceCardImage": "Insurance Card Image",
    "requestDetail.noSubmittedData": "No submitted data is stored for this request yet.",
    "requestDetail.requestType": "Request Type",
    "requestDetail.clinic": "Clinic",
    "requestDetail.language": "Language",

    "flowMessages.title": "Flow Messages",
    "flowMessages.description":
      "Write the visible WhatsApp text for the approved clinic flow and keep it readable.",
    "flowMessages.summaryTitle": "Scoped clinic message set",
    "flowMessages.summaryDescription":
      "Fix wording, line breaks, and translation quality without touching hidden backend fields.",
    "flowMessages.openFlowSteps": "Open Flow Steps",
    "flowMessages.messageKeys": "Message keys",
    "flowMessages.configured": "Configured",
    "flowMessages.missingText": "Missing text",
    "flowMessages.linkedSteps": "Linked steps",
    "flowMessages.searchPlaceholder": "Search message key or step code...",
    "flowMessages.templateStatus": "Template status",
    "flowMessages.loading": "Loading flow messages...",
    "flowMessages.error": "Unable to load flow messages.",
    "flowMessages.empty": "No flow messages are linked to this workspace.",
    "flowMessages.noVisibleText": "No visible text saved yet.",
    "flowMessages.usedInSteps": "Used in {count} step(s): {steps}",
    "flowMessages.editorTitle": "Message Editor",
    "flowMessages.editorHint":
      "Use real line breaks between the question, the numbered options, and the reply instruction. The formatter button will clean one-line prompts automatically.",
    "flowMessages.selectMessage": "Select a message key to edit its text.",
    "flowMessages.formatText": "Format Text",
    "flowMessages.saveMessage": "Save Message",
    "flowMessages.deleteSavedText": "Delete Saved Text",
    "flowMessages.saving": "Saving...",
    "flowMessages.deleting": "Deleting...",
    "flowMessages.saved": "Saved message: {key}",
    "flowMessages.deleted": "Deleted saved text for {key}",
    "flowMessages.formatted": "Message text formatted with line breaks.",
    "flowMessages.confirmDelete": "Delete the saved text for this message key?",
    "flowMessages.arabicText": "Arabic text (ar)",
    "flowMessages.englishText": "English text (en)",
    "flowMessages.germanText": "German text (de)",
    "flowMessages.placeholderArabic": "Write the Arabic WhatsApp message...",
    "flowMessages.placeholderEnglish": "Write the English WhatsApp message...",
    "flowMessages.placeholderGerman": "Write the German WhatsApp message...",
    "flowMessages.linkedKey": "Key: {key}",
    "flowMessages.infoLinked":
      "This key is linked to the selected step. Save the visible prompt text here, then return to Flow Steps only if you need to change the routing or data field.",

    "flowSteps.title": "Flow Steps",
    "flowSteps.description": "Build and inspect the clinic flow step by step.",
    "flowSteps.openFlowMessages": "Open Flow Messages",
    "flowSteps.searchPlaceholder": "Search by code, type, data field, or linked message...",
    "flowSteps.loading": "Loading flow steps...",
    "flowSteps.error": "Unable to load flow steps.",
    "flowSteps.empty": "No flow steps are visible in this workspace.",
    "flowSteps.step": "Step {sequence}",
    "flowSteps.messageKey": "Message key",
    "flowSteps.storedField": "Stored field",
    "flowSteps.routing": "Routing",
    "flowSteps.noMessageKey": "No message key linked yet.",
    "flowSteps.noVisibleText":
      "No visible text is configured yet. Save the text in Flow Messages.",
    "flowSteps.noStoredField": "No stored field",
    "flowSteps.noStoredFieldDescription": "This step does not store a field into the request data.",
    "flowSteps.choiceOptions": "{count} options",
    "flowSteps.noChoiceRoutes": "No choice routes are configured yet.",
    "flowSteps.sendMessage": "Send message",
    "flowSteps.askChoice": "Ask for a choice",
    "flowSteps.collectTextOrMedia": "Collect text or media",
    "flowSteps.finishFlow": "Finish flow",
    "flowSteps.edit": "Edit",
    "flowSteps.delete": "Delete",
    "flowSteps.deleting": "Deleting...",
    "flowSteps.saveChanges": "Save Step Changes",
    "flowSteps.cancelEdit": "Cancel Edit",
    "flowSteps.stepCode": "Step code",
    "flowSteps.type": "Type",
    "flowSteps.status": "Status",
    "flowSteps.sequence": "Sequence",
    "flowSteps.dataKey": "Stored field",
    "flowSteps.editMessageKey": "Message key",
    "flowSteps.choiceMap": "Choice options",
    "flowSteps.transitionConfig": "Advanced routing",
    "flowSteps.openAdvancedJson": "Open advanced JSON",
    "flowSteps.hideAdvancedJson": "Hide advanced JSON",
    "flowSteps.saveSuccess": "Step updated successfully.",
    "flowSteps.deleteSuccess": "Step deleted successfully.",
    "flowSteps.confirmDelete": "Delete this flow step?",
    "flowSteps.summaryMessageContinue": "Sends a message, then continues to {nextStep}.",
    "flowSteps.summaryMessage": "Sends a message in the conversation.",
    "flowSteps.summaryChoice": "Asks the person to choose between {count} options and stores the selection in {field}.",
    "flowSteps.summaryChoiceNoField": "Asks the person to choose between {count} options.",
    "flowSteps.summaryInput": "Collects a typed or uploaded reply and stores it in {field}, then continues to {nextStep}.",
    "flowSteps.summaryInputNoField":
      "Collects a typed or uploaded reply, then continues to {nextStep}.",
    "flowSteps.summaryEnd": "Ends the conversation.",
    "flowSteps.summaryUnknown": "Uses custom step logic configured in the backend.",
    "flowSteps.fieldDescription": "Answers from this step are saved under {field}.",

    "baileys.title": "WhatsApp Pairing",
    "baileys.description": "Baileys connection status and QR pairing.",
    "baileys.controlsTitle": "Connection Controls",
    "baileys.controlsDescription": "This workspace is locked to one approved WhatsApp channel account.",
    "baileys.scopedAccount": "Scoped WhatsApp Account",
    "baileys.scopedAccountHint": "The client workspace can only pair and monitor this one approved account.",
    "baileys.start": "Start",
    "baileys.refreshStatus": "Refresh Status",
    "baileys.fetchQr": "Fetch QR",
    "baileys.logout": "Logout",
    "baileys.liveState": "Live state: {status}",
    "baileys.autoRefresh": "Auto-refreshing every 3s while pairing is active.",
    "baileys.initialized": "Initialized",
    "baileys.connected": "Connected",
    "baileys.statusLabel": "Status",
    "baileys.qrAvailable": "QR Available",
    "baileys.phoneNumber": "Phone Number",
    "baileys.lastConnectionUpdate": "Last connection update",
    "baileys.pairingQr": "Pairing QR",
    "baileys.pairingQrDescription":
      "Scan this code from WhatsApp Linked Devices while the selected channel account is connecting.",
    "baileys.noQr": "No active QR is available right now. Start the connection, then wait for the live auto-refresh cycle to pull it in.",
    "baileys.connectedNoQr": "This account is already connected. No QR is needed.",
    "baileys.startRequested": "Baileys start request sent. The page will auto-refresh while pairing is active.",
    "baileys.connectedBanner":
      "WhatsApp is connected. Incoming text messages can now pass through the existing runtime flow.",
    "baileys.loadingAccounts": "Loading channel accounts...",
    "baileys.noAccounts": "No channel accounts were found. Create a WhatsApp-compatible channel account before pairing.",
    "baileys.selectAccountFirst": "Select a channel account first.",
    "baileys.channelAccount": "Channel Account",
    "baileys.selectChannelAccount": "Select channel account",
    "baileys.noScopedAccount": "No scoped channel account is available.",
    "baileys.chooseAccountHelp": "Choose the channel account that should own the WhatsApp device session.",
    "baileys.selectedAccount": "Selected: {account}",
    "baileys.fetchedQr": "Fetched the current pairing QR.",
    "baileys.loggedOut": "Baileys connection logged out successfully.",
    "baileys.startTimeout": "The start request exceeded the browser timeout, but Baileys initialization may still be running. The page will keep polling status and QR.",
    "baileys.fetchingQr": "Fetching QR...",
    "baileys.loggingOut": "Logging Out...",

    "gemini.title": "Gemini Assistant",
    "gemini.description": "Manage the insurance card OCR prompt and admin AI tools.",
    "gemini.studioTitle": "Gemini Studio",
    "gemini.studioDescription":
      "Manage the insurance-card OCR prompt used by the clinic WhatsApp workspace.",
    "gemini.promptTitle": "Insurance Card OCR Prompt",
    "gemini.promptDescription":
      "This prompt controls how Gemini validates and reads insurance card images coming from WhatsApp.",
    "gemini.promptText": "Prompt text",
    "gemini.savePrompt": "Save Prompt",
    "gemini.resetPrompt": "Reset to Default",
    "gemini.defaultPreview": "Default preview",
    "gemini.resetHint":
      "Reset always restores this exact backend default prompt, not a frontend copy.",
    "gemini.saved": "OCR prompt saved.",
    "gemini.reset": "OCR prompt reset to backend default.",
    "gemini.loadingPrompt": "Loading OCR prompt...",
    "gemini.currentLines": "Current lines",
    "gemini.currentCharacters": "Current characters",
    "gemini.defaultLines": "Default lines",
    "gemini.defaultCharacters": "Default characters",
    "gemini.saving": "Saving...",
    "gemini.resetting": "Resetting...",
    "gemini.adminStudioDescription": "Manage the insurance-card OCR prompt and use Gemini directly from the admin dashboard.",
  },
  ar: {
    "language.english": "الإنجليزية",
    "language.arabic": "العربية",
    "language.german": "الألمانية",
    "language.label": "اللغة",
    "language.default": "اللغة الافتراضية",

    "section.overview": "نظرة عامة",
    "section.conversationDesign": "تصميم المحادثة",
    "section.operations": "العمليات",
    "section.workspaceSetup": "إعداد مساحة العمل",
    "section.navigation": "التنقل",

    "nav.dashboard.title": "لوحة التحكم",
    "nav.dashboard.description": "نظرة عامة وحالة الخادم.",
    "nav.flowMessages.title": "رسائل التدفق",
    "nav.flowMessages.description": "حرر النصوص الظاهرة التي يستلمها المستخدم داخل التدفق.",
    "nav.flowSteps.title": "خطوات التدفق",
    "nav.flowSteps.description": "ابنِ تدفق العيادة وتفقده خطوة بخطوة.",
    "nav.serviceRequests.title": "الطلبات العامة",
    "nav.serviceRequests.description": "افتح أولًا الطلبات غير الموعدية غير المعالجة.",
    "nav.medicalAppointments.title": "المواعيد الطبية",
    "nav.medicalAppointments.description": "افتح أولًا طلبات المواعيد غير المعالجة.",
    "nav.baileys.title": "ربط واتساب",
    "nav.baileys.description": "حالة اتصال Baileys وربط رمز QR.",
    "nav.gemini.title": "مساعد Gemini",
    "nav.gemini.description": "إدارة موجّه قراءة بطاقة التأمين وأدوات الذكاء الاصطناعي.",

    "sidebar.brand": "الروبوت الحواري",
    "sidebar.clientTitle": "لوحة العميل",
    "sidebar.clientDescription":
      "راجع طلبات الخدمة، وأدر تدفق واتساب الخاص بالعيادة، واربط حساب واتساب المعتمد.",
    "sidebar.adminTitle": "لوحة الإدارة",
    "sidebar.adminDescription":
      "هيّئ التدفقات وراقب الجلسات وتحقق من سلوك التشغيل من مساحة عمل داخلية واحدة.",
    "sidebar.currentMode": "الوضع الحالي",
    "sidebar.clientScopeTitle": "مساحة عميل محدودة",
    "sidebar.clientScopeDescription":
      "لا يظهر هنا إلا التدفق المحدد وحساب واتساب المحدد وطلبات الخدمة المرتبطة بهما.",

    "topbar.clientChip": "مساحة العميل",
    "topbar.adminChip": "اللوحة الداخلية",
    "topbar.metaFallback": "عمليات روبوت مبنية على البيانات والتحقق من وقت التشغيل.",
    "topbar.logout": "تسجيل الخروج",

    "common.refresh": "تحديث",
    "common.retry": "إعادة المحاولة",
    "common.loading": "جارٍ التحميل...",
    "common.save": "حفظ",
    "common.delete": "حذف",
    "common.edit": "تعديل",
    "common.cancel": "إلغاء",
    "common.openPage": "فتح الصفحة",
    "common.clearFilters": "مسح المرشحات",
    "common.notProvided": "غير متوفر",
    "common.viewAll": "عرض الكل",
    "common.notOpened": "غير المفتوحة ({count})",
    "common.all": "الكل",
    "common.status": "الحالة",
    "common.language": "اللغة",
    "common.search": "بحث",
    "common.noResults": "لا توجد نتائج مطابقة.",
    "common.empty": "لا توجد سجلات.",
    "common.markDone": "وضع علامة تم",
    "common.done": "تم",
    "common.back": "رجوع",
    "common.confirm": "تأكيد",
    "common.download": "تنزيل",
    "common.openFullImage": "فتح الصورة كاملة",
    "common.yes": "نعم",
    "common.no": "لا",
    "common.lastUpdated": "آخر تحديث",
    "common.default": "الافتراضي",
    "common.customized": "مخصص",
    "common.lines": "الأسطر",
    "common.characters": "الأحرف",
    "common.showingCount": "عرض {filteredCount} من {totalCount}",
    "common.showingRange": "عرض {startItem}-{endItem} من {totalItems}",
    "common.rows": "الصفوف",
    "common.pageCount": "الصفحة {currentPage} من {totalPages}",
    "common.previous": "السابق",
    "common.next": "التالي",
    "common.refreshing": "جارٍ التحديث...",
    "common.saving": "جارٍ الحفظ...",
    "common.resetting": "جارٍ الاستعادة...",
    "common.starting": "جارٍ البدء...",
    "common.deleting": "جارٍ الحذف...",

    "status.active": "نشط",
    "status.inactive": "غير نشط",
    "status.new": "جديد",
    "status.completed": "مكتمل",
    "status.done": "تم",
    "status.pending": "قيد الانتظار",
    "status.cancelled": "ملغى",
    "status.rejected": "مرفوض",
    "status.draft": "مسودة",
    "status.connected": "متصل",
    "status.disconnected": "غير متصل",
    "status.connecting": "جارٍ الاتصال",
    "status.idle": "خامل",
    "status.not_initialized": "غير مهيأ",

    "dashboard.heroKicker": "قبل الإطلاق",
    "dashboard.heroTitle": "أدر تدفق واتساب الخاص بالعيادة من مساحة عميل محددة وواضحة.",
    "dashboard.heroDescription":
      "استخدم هذه المساحة لإدارة تدفق واتساب واحد للعيادة: تحديث الرسائل، وضبط منطق الخطوات، وربط واتساب، ومتابعة الطلبات الواردة.",
    "dashboard.healthTitle": "حالة الخادم",
    "dashboard.healthOnline": "متصل",
    "dashboard.healthOffline": "غير متصل",
    "dashboard.healthUnknown": "غير معروف",
    "dashboard.healthRunning": "الخادم يعمل",
    "dashboard.healthUnavailable": "فحص الحالة غير متاح حاليًا.",
    "dashboard.healthSource": "المصدر: {path}. تحقق من هذا أولًا قبل اختبار التدفقات أو اتصالات المزود.",
    "dashboard.healthRetry": "إعادة فحص الحالة",
    "dashboard.workflowTitle": "الخطوات المقترحة",
    "dashboard.workflow1": "ابدأ بتعديل النصوص الظاهرة في رسائل التدفق.",
    "dashboard.workflow2": "عدّل منطق المحادثة في خطوات التدفق فقط عند الحاجة.",
    "dashboard.workflow3": "اربط واتساب في صفحة ربط واتساب قبل الإطلاق.",
    "dashboard.workflow4": "راقب النتائج الحقيقية في الطلبات العامة.",
    "dashboard.cardNew": "{count} جديد",

    "serviceRequests.title": "الطلبات العامة",
    "serviceRequests.description":
      "راجع الطلبات غير الموعدية القادمة من تدفق واتساب الخاص بالعيادة.",
    "serviceRequests.allVisible": "كل الطلبات الظاهرة",
    "serviceRequests.searchPlaceholder": "ابحث بالطلب أو الشخص أو الهاتف أو الخدمة...",
    "serviceRequests.loading": "جارٍ تحميل الطلبات...",
    "serviceRequests.empty": "لا توجد طلبات ظاهرة في مساحة العمل هذه.",
    "serviceRequests.noMatches": "لا توجد طلبات مطابقة للمرشحات الحالية.",
    "serviceRequests.request": "الطلب",
    "serviceRequests.person": "الشخص",
    "serviceRequests.phone": "الهاتف",
    "serviceRequests.clinic": "العيادة",
    "serviceRequests.serviceNeeded": "الخدمة المطلوبة",
    "serviceRequests.status": "الحالة",
    "serviceRequests.submittedAt": "تاريخ الإرسال",
    "serviceRequests.language": "اللغة",
    "serviceRequests.openRequest": "فتح الطلب {reference}",
    "serviceRequests.dateOfBirth": "تاريخ الميلاد: {value}",
    "serviceRequests.pendingSlot": "موعد قيد الانتظار",

    "medicalAppointments.title": "المواعيد الطبية",
    "medicalAppointments.description":
      "راجع طلبات المواعيد وتابع الأوقات المطلوبة.",
    "medicalAppointments.searchPlaceholder": "ابحث بالطلب أو المريض أو الهاتف أو الموعد...",
    "medicalAppointments.loading": "جارٍ تحميل طلبات المواعيد...",
    "medicalAppointments.empty": "لا توجد طلبات مواعيد ظاهرة في مساحة العمل هذه.",
    "medicalAppointments.noMatches": "لا توجد مواعيد مطابقة للمرشحات الحالية.",
    "medicalAppointments.request": "الطلب",
    "medicalAppointments.patient": "المريض",
    "medicalAppointments.phone": "الهاتف",
    "medicalAppointments.clinic": "العيادة",
    "medicalAppointments.requestedSlot": "الموعد المطلوب",
    "medicalAppointments.status": "الحالة",
    "medicalAppointments.submittedAt": "تاريخ الإرسال",
    "medicalAppointments.openRequest": "فتح الموعد {reference}",
    "medicalAppointments.dateLabel": "التاريخ",
    "medicalAppointments.timeLabel": "الوقت",
    "medicalAppointments.pendingSlot": "موعد غير محدد",
    "medicalAppointments.slotJoiner": " في ",

    "requestDetail.backToRequests": "العودة إلى الطلبات العامة",
    "requestDetail.backToAppointments": "العودة إلى المواعيد الطبية",
    "requestDetail.description": "تفاصيل الطلب المرتبطة بمساحة العميل.",
    "requestDetail.loading": "جارٍ تحميل تفاصيل الطلب...",
    "requestDetail.notFound": "تعذر العثور على هذا الطلب داخل مساحة العمل هذه.",
    "requestDetail.markDoneSuccess": "تم وضع علامة تم على الطلب.",
    "requestDetail.summary": "ملخص الطلب",
    "requestDetail.requestNumber": "رقم الطلب",
    "requestDetail.serviceNeeded": "الخدمة المطلوبة",
    "requestDetail.serviceArea": "مجال الخدمة",
    "requestDetail.priority": "الأولوية",
    "requestDetail.personDetails": "بيانات الشخص",
    "requestDetail.fullName": "الاسم الكامل",
    "requestDetail.phoneNumber": "رقم الهاتف",
    "requestDetail.email": "البريد الإلكتروني",
    "requestDetail.dateOfBirth": "تاريخ الميلاد",
    "requestDetail.submittedInformation": "المعلومات المرسلة",
    "requestDetail.medicalDocuments": "المستندات الطبية",
    "requestDetail.insuranceCardImage": "صورة بطاقة التأمين",
    "requestDetail.noSubmittedData": "لا توجد معلومات محفوظة لهذا الطلب بعد.",
    "requestDetail.requestType": "نوع الطلب",
    "requestDetail.clinic": "العيادة",
    "requestDetail.language": "اللغة",

    "flowMessages.title": "رسائل التدفق",
    "flowMessages.description":
      "اكتب نصوص واتساب الظاهرة للتدفق المعتمد وحافظ على وضوحها.",
    "flowMessages.summaryTitle": "رسائل التدفق المعتمدة",
    "flowMessages.summaryDescription":
      "صحح الصياغة وفواصل الأسطر وجودة الترجمة دون تعديل الحقول الخلفية المخفية.",
    "flowMessages.openFlowSteps": "فتح خطوات التدفق",
    "flowMessages.messageKeys": "مفاتيح الرسائل",
    "flowMessages.configured": "مُعدّة",
    "flowMessages.missingText": "نص مفقود",
    "flowMessages.linkedSteps": "الخطوات المرتبطة",
    "flowMessages.searchPlaceholder": "ابحث بمفتاح الرسالة أو رمز الخطوة...",
    "flowMessages.templateStatus": "حالة القالب",
    "flowMessages.loading": "جارٍ تحميل رسائل التدفق...",
    "flowMessages.error": "تعذر تحميل رسائل التدفق.",
    "flowMessages.empty": "لا توجد رسائل تدفق مرتبطة بمساحة العمل هذه.",
    "flowMessages.noVisibleText": "لا يوجد نص ظاهر محفوظ حتى الآن.",
    "flowMessages.usedInSteps": "مستخدمة في {count} خطوة: {steps}",
    "flowMessages.editorTitle": "محرر الرسائل",
    "flowMessages.editorHint":
      "استخدم فواصل أسطر حقيقية بين السؤال والخيارات المرقمة وتعليمات الرد. زر التنسيق ينظف الرسائل ذات السطر الواحد تلقائيًا.",
    "flowMessages.selectMessage": "اختر مفتاح رسالة لتعديل النص.",
    "flowMessages.formatText": "تنسيق النص",
    "flowMessages.saveMessage": "حفظ الرسالة",
    "flowMessages.deleteSavedText": "حذف النص المحفوظ",
    "flowMessages.saving": "جارٍ الحفظ...",
    "flowMessages.deleting": "جارٍ الحذف...",
    "flowMessages.saved": "تم حفظ الرسالة: {key}",
    "flowMessages.deleted": "تم حذف النص المحفوظ لـ {key}",
    "flowMessages.formatted": "تم تنسيق نص الرسالة باستخدام فواصل أسطر.",
    "flowMessages.confirmDelete": "حذف النص المحفوظ لهذا المفتاح؟",
    "flowMessages.arabicText": "النص العربي (ar)",
    "flowMessages.englishText": "النص الإنجليزي (en)",
    "flowMessages.germanText": "النص الألماني (de)",
    "flowMessages.placeholderArabic": "اكتب رسالة واتساب بالعربية...",
    "flowMessages.placeholderEnglish": "اكتب رسالة واتساب بالإنجليزية...",
    "flowMessages.placeholderGerman": "اكتب رسالة واتساب بالألمانية...",
    "flowMessages.linkedKey": "المفتاح: {key}",
    "flowMessages.infoLinked":
      "هذا المفتاح مرتبط بالخطوة المحددة. احفظ النص الظاهر هنا، وعد إلى خطوات التدفق فقط إذا احتجت إلى تعديل التوجيه أو حقل البيانات.",

    "flowSteps.title": "خطوات التدفق",
    "flowSteps.description": "ابنِ تدفق العيادة وتفقده خطوة بخطوة.",
    "flowSteps.openFlowMessages": "فتح رسائل التدفق",
    "flowSteps.searchPlaceholder": "ابحث بالرمز أو النوع أو الحقل أو الرسالة المرتبطة...",
    "flowSteps.loading": "جارٍ تحميل خطوات التدفق...",
    "flowSteps.error": "تعذر تحميل خطوات التدفق.",
    "flowSteps.empty": "لا توجد خطوات تدفق ظاهرة في مساحة العمل هذه.",
    "flowSteps.step": "الخطوة {sequence}",
    "flowSteps.messageKey": "مفتاح الرسالة",
    "flowSteps.storedField": "الحقل المحفوظ",
    "flowSteps.routing": "التوجيه",
    "flowSteps.noMessageKey": "لا يوجد مفتاح رسالة مرتبط بعد.",
    "flowSteps.noVisibleText": "لا يوجد نص ظاهر مضبوط بعد. احفظ النص في رسائل التدفق.",
    "flowSteps.noStoredField": "لا يوجد حقل محفوظ",
    "flowSteps.noStoredFieldDescription": "هذه الخطوة لا تحفظ أي حقل ضمن بيانات الطلب.",
    "flowSteps.choiceOptions": "{count} خيارات",
    "flowSteps.noChoiceRoutes": "لا توجد مسارات اختيار مضبوطة بعد.",
    "flowSteps.sendMessage": "إرسال رسالة",
    "flowSteps.askChoice": "طلب اختيار",
    "flowSteps.collectTextOrMedia": "جمع نص أو ملف",
    "flowSteps.finishFlow": "إنهاء التدفق",
    "flowSteps.edit": "تعديل",
    "flowSteps.delete": "حذف",
    "flowSteps.deleting": "جارٍ الحذف...",
    "flowSteps.saveChanges": "حفظ التعديلات",
    "flowSteps.cancelEdit": "إلغاء التعديل",
    "flowSteps.stepCode": "رمز الخطوة",
    "flowSteps.type": "النوع",
    "flowSteps.status": "الحالة",
    "flowSteps.sequence": "الترتيب",
    "flowSteps.dataKey": "الحقل المحفوظ",
    "flowSteps.editMessageKey": "مفتاح الرسالة",
    "flowSteps.choiceMap": "خيارات الاختيار",
    "flowSteps.transitionConfig": "توجيه متقدم",
    "flowSteps.openAdvancedJson": "فتح JSON المتقدم",
    "flowSteps.hideAdvancedJson": "إخفاء JSON المتقدم",
    "flowSteps.saveSuccess": "تم تحديث الخطوة بنجاح.",
    "flowSteps.deleteSuccess": "تم حذف الخطوة بنجاح.",
    "flowSteps.confirmDelete": "حذف خطوة التدفق هذه؟",
    "flowSteps.summaryMessageContinue": "ترسل رسالة ثم تتابع إلى {nextStep}.",
    "flowSteps.summaryMessage": "ترسل رسالة داخل المحادثة.",
    "flowSteps.summaryChoice": "تطلب من الشخص الاختيار بين {count} خيارات وتحفظ النتيجة في {field}.",
    "flowSteps.summaryChoiceNoField": "تطلب من الشخص الاختيار بين {count} خيارات.",
    "flowSteps.summaryInput": "تجمع ردًا نصيًا أو ملفًا وتحفظه في {field} ثم تتابع إلى {nextStep}.",
    "flowSteps.summaryInputNoField": "تجمع ردًا نصيًا أو ملفًا ثم تتابع إلى {nextStep}.",
    "flowSteps.summaryEnd": "تنهي المحادثة.",
    "flowSteps.summaryUnknown": "تستخدم منطق خطوة مخصصًا من الخلفية.",
    "flowSteps.fieldDescription": "تُحفَظ إجابات هذه الخطوة تحت {field}.",

    "baileys.title": "ربط واتساب",
    "baileys.description": "حالة اتصال Baileys وربط QR.",
    "baileys.controlsTitle": "عناصر التحكم بالاتصال",
    "baileys.controlsDescription": "هذه المساحة مرتبطة بحساب واتساب معتمد واحد فقط.",
    "baileys.scopedAccount": "حساب واتساب المعتمد",
    "baileys.scopedAccountHint": "يمكن لمساحة العميل ربط ومراقبة هذا الحساب المعتمد فقط.",
    "baileys.start": "بدء",
    "baileys.refreshStatus": "تحديث الحالة",
    "baileys.fetchQr": "جلب QR",
    "baileys.logout": "تسجيل الخروج",
    "baileys.liveState": "الحالة الحالية: {status}",
    "baileys.autoRefresh": "يتم التحديث تلقائيًا كل 3 ثوانٍ أثناء الربط.",
    "baileys.initialized": "مهيأ",
    "baileys.connected": "متصل",
    "baileys.statusLabel": "الحالة",
    "baileys.qrAvailable": "QR متاح",
    "baileys.phoneNumber": "رقم الهاتف",
    "baileys.lastConnectionUpdate": "آخر تحديث للاتصال",
    "baileys.pairingQr": "رمز الربط QR",
    "baileys.pairingQrDescription":
      "امسح هذا الرمز من الأجهزة المرتبطة في واتساب أثناء اتصال الحساب المحدد.",
    "baileys.noQr": "لا يوجد رمز QR نشط حاليًا. ابدأ الاتصال ثم انتظر التحديث التلقائي المباشر.",
    "baileys.connectedNoQr": "هذا الحساب متصل بالفعل. لا حاجة إلى QR.",
    "baileys.startRequested": "تم إرسال طلب بدء Baileys. سيتم تحديث الصفحة تلقائيًا أثناء الربط.",
    "baileys.connectedBanner": "واتساب متصل. يمكن الآن تمرير الرسائل النصية الواردة عبر التدفق الحالي.",
    "baileys.loadingAccounts": "جارٍ تحميل حسابات القنوات...",
    "baileys.noAccounts": "لم يتم العثور على حسابات قنوات. أنشئ حساب قناة متوافقاً مع واتساب قبل الربط.",
    "baileys.selectAccountFirst": "اختر حساب قناة أولاً.",
    "baileys.channelAccount": "حساب القناة",
    "baileys.selectChannelAccount": "اختر حساب القناة",
    "baileys.noScopedAccount": "لا يوجد حساب قناة محدد لهذه المساحة.",
    "baileys.chooseAccountHelp": "اختر حساب القناة الذي سيملك جلسة جهاز واتساب.",
    "baileys.selectedAccount": "المحدد: {account}",
    "baileys.fetchedQr": "تم جلب رمز QR الحالي للربط.",
    "baileys.loggedOut": "تم تسجيل خروج اتصال Baileys بنجاح.",
    "baileys.startTimeout": "تجاوز طلب البدء مهلة المتصفح، لكن تهيئة Baileys قد تكون ما زالت تعمل. ستواصل الصفحة جلب الحالة ورمز QR.",
    "baileys.fetchingQr": "جارٍ جلب QR...",
    "baileys.loggingOut": "جارٍ تسجيل الخروج...",

    "gemini.title": "مساعد Gemini",
    "gemini.description": "إدارة موجّه قراءة بطاقات التأمين وأدوات الذكاء الاصطناعي.",
    "gemini.studioTitle": "استوديو Gemini",
    "gemini.studioDescription":
      "إدارة موجّه OCR لبطاقات التأمين المستخدم في مساحة واتساب الخاصة بالعيادة.",
    "gemini.promptTitle": "موجّه OCR لبطاقة التأمين",
    "gemini.promptDescription":
      "هذا الموجّه يحدد كيف يتحقق Gemini من صور بطاقات التأمين القادمة من واتساب ويقرأها.",
    "gemini.promptText": "نص الموجّه",
    "gemini.savePrompt": "حفظ الموجّه",
    "gemini.resetPrompt": "إعادة للوضع الافتراضي",
    "gemini.defaultPreview": "معاينة الافتراضي",
    "gemini.resetHint": "تعيد الاستعادة نفس الموجّه الافتراضي من الخلفية، وليس نسخة من الواجهة.",
    "gemini.saved": "تم حفظ موجّه OCR.",
    "gemini.reset": "تمت إعادة موجّه OCR إلى الافتراضي.",
    "gemini.loadingPrompt": "جارٍ تحميل موجّه OCR...",
    "gemini.currentLines": "الأسطر الحالية",
    "gemini.currentCharacters": "الأحرف الحالية",
    "gemini.defaultLines": "الأسطر الافتراضية",
    "gemini.defaultCharacters": "الأحرف الافتراضية",
    "gemini.saving": "جارٍ الحفظ...",
    "gemini.resetting": "جارٍ الاستعادة...",
    "gemini.adminStudioDescription": "إدارة موجّه OCR لبطاقة التأمين واستخدام Gemini مباشرة من لوحة الإدارة.",
  },
  de: {
    "language.english": "Englisch",
    "language.arabic": "Arabisch",
    "language.german": "Deutsch",
    "language.label": "Sprache",
    "language.default": "Standardsprache",

    "section.overview": "Übersicht",
    "section.conversationDesign": "Gesprächsdesign",
    "section.operations": "Betrieb",
    "section.workspaceSetup": "Arbeitsbereich",
    "section.navigation": "Navigation",

    "nav.dashboard.title": "Dashboard",
    "nav.dashboard.description": "Übersicht und Backend-Status.",
    "nav.flowMessages.title": "Ablaufnachrichten",
    "nav.flowMessages.description": "Bearbeiten Sie die sichtbaren Texte im Ablauf.",
    "nav.flowSteps.title": "Ablaufschritte",
    "nav.flowSteps.description": "Den Klinikablauf Schritt für Schritt aufbauen und prüfen.",
    "nav.serviceRequests.title": "Allgemeine Anfragen",
    "nav.serviceRequests.description": "Zuerst offene Nicht-Termin-Anfragen anzeigen.",
    "nav.medicalAppointments.title": "Medizinische Termine",
    "nav.medicalAppointments.description": "Zuerst offene Termin-Anfragen anzeigen.",
    "nav.baileys.title": "WhatsApp-Kopplung",
    "nav.baileys.description": "Baileys-Verbindungsstatus und QR-Kopplung.",
    "nav.gemini.title": "Gemini-Assistent",
    "nav.gemini.description": "OCR-Prompt für Versicherungskarten und KI-Werkzeuge verwalten.",

    "sidebar.brand": "Conversational Bot",
    "sidebar.clientTitle": "Kundenkonsole",
    "sidebar.clientDescription":
      "Serviceanfragen prüfen, Klinik-WhatsApp-Ablauf verwalten und das freigegebene WhatsApp-Konto koppeln.",
    "sidebar.adminTitle": "Admin-Konsole",
    "sidebar.adminDescription":
      "Abläufe konfigurieren, Sitzungen überwachen und Laufzeitverhalten in einem internen Arbeitsbereich prüfen.",
    "sidebar.currentMode": "Aktueller Modus",
    "sidebar.clientScopeTitle": "Begrenzter Kundenbereich",
    "sidebar.clientScopeDescription":
      "Nur der zugewiesene Ablauf, das zugewiesene WhatsApp-Konto und die dazugehörigen Anfragen sind sichtbar.",

    "topbar.clientChip": "Kundenbereich",
    "topbar.adminChip": "Interne Konsole",
    "topbar.metaFallback": "Datengetriebene Bot-Abläufe und Laufzeitvalidierung.",
    "topbar.logout": "Abmelden",

    "common.refresh": "Aktualisieren",
    "common.retry": "Erneut versuchen",
    "common.loading": "Wird geladen...",
    "common.save": "Speichern",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.cancel": "Abbrechen",
    "common.openPage": "Seite öffnen",
    "common.clearFilters": "Filter zurücksetzen",
    "common.notProvided": "Nicht angegeben",
    "common.viewAll": "Alle anzeigen",
    "common.notOpened": "Nicht geöffnet ({count})",
    "common.all": "Alle",
    "common.status": "Status",
    "common.language": "Sprache",
    "common.search": "Suche",
    "common.noResults": "Keine passenden Ergebnisse.",
    "common.empty": "Keine Einträge gefunden.",
    "common.markDone": "Als erledigt markieren",
    "common.done": "Erledigt",
    "common.back": "Zurück",
    "common.confirm": "Bestätigen",
    "common.download": "Herunterladen",
    "common.openFullImage": "Bild vollständig öffnen",
    "common.yes": "Ja",
    "common.no": "Nein",
    "common.lastUpdated": "Zuletzt aktualisiert",
    "common.default": "Standard",
    "common.customized": "Angepasst",
    "common.lines": "Zeilen",
    "common.characters": "Zeichen",
    "common.showingCount": "{filteredCount} von {totalCount} angezeigt",
    "common.showingRange": "{startItem}-{endItem} von {totalItems} angezeigt",
    "common.rows": "Zeilen",
    "common.pageCount": "Seite {currentPage} von {totalPages}",
    "common.previous": "Zurück",
    "common.next": "Weiter",
    "common.refreshing": "Wird aktualisiert...",
    "common.saving": "Wird gespeichert...",
    "common.resetting": "Wird zurückgesetzt...",
    "common.starting": "Wird gestartet...",
    "common.deleting": "Wird gelöscht...",

    "status.active": "Aktiv",
    "status.inactive": "Inaktiv",
    "status.new": "Neu",
    "status.completed": "Abgeschlossen",
    "status.done": "Erledigt",
    "status.pending": "Ausstehend",
    "status.cancelled": "Storniert",
    "status.rejected": "Abgelehnt",
    "status.draft": "Entwurf",
    "status.connected": "Verbunden",
    "status.disconnected": "Getrennt",
    "status.connecting": "Verbindet",
    "status.idle": "Inaktiv",
    "status.not_initialized": "Nicht initialisiert",

    "dashboard.heroKicker": "Vor dem Go-live",
    "dashboard.heroTitle": "Betreiben Sie den Klinik-WhatsApp-Ablauf in einem klar begrenzten Kundenbereich.",
    "dashboard.heroDescription":
      "Verwenden Sie diesen Bereich, um einen Klinik-WhatsApp-Ablauf zu pflegen: Nachrichtentexte aktualisieren, Schrittlogik anpassen, WhatsApp koppeln und eingehende Anfragen verfolgen.",
    "dashboard.healthTitle": "Backend-Status",
    "dashboard.healthOnline": "Online",
    "dashboard.healthOffline": "Offline",
    "dashboard.healthUnknown": "Unbekannt",
    "dashboard.healthRunning": "Server läuft",
    "dashboard.healthUnavailable": "Der Statuscheck ist derzeit nicht verfügbar.",
    "dashboard.healthSource": "Quelle: {path}. Prüfen Sie dies zuerst, bevor Sie Abläufe oder Provider-Verbindungen testen.",
    "dashboard.healthRetry": "Status erneut prüfen",
    "dashboard.workflowTitle": "Empfohlener Ablauf",
    "dashboard.workflow1": "Zuerst die sichtbaren Texte in Ablaufnachrichten bearbeiten.",
    "dashboard.workflow2": "Die Gesprächslogik nur bei Bedarf in Ablaufschritten anpassen.",
    "dashboard.workflow3": "WhatsApp vor dem Go-live in WhatsApp-Kopplung verbinden.",
    "dashboard.workflow4": "Reale Ergebnisse in Allgemeine Anfragen überwachen.",
    "dashboard.cardNew": "{count} neu",

    "serviceRequests.title": "Allgemeine Anfragen",
    "serviceRequests.description":
      "Nicht-terminbezogene Anfragen aus dem Klinik-WhatsApp-Ablauf prüfen.",
    "serviceRequests.allVisible": "Alle sichtbaren Anfragen",
    "serviceRequests.searchPlaceholder": "Nach Anfrage, Person, Telefon oder Service suchen...",
    "serviceRequests.loading": "Anfragen werden geladen...",
    "serviceRequests.empty": "In diesem Arbeitsbereich sind keine Anfragen sichtbar.",
    "serviceRequests.noMatches": "Keine Anfragen entsprechen den aktuellen Filtern.",
    "serviceRequests.request": "Anfrage",
    "serviceRequests.person": "Person",
    "serviceRequests.phone": "Telefon",
    "serviceRequests.clinic": "Praxis",
    "serviceRequests.serviceNeeded": "Benötigter Service",
    "serviceRequests.status": "Status",
    "serviceRequests.submittedAt": "Eingegangen am",
    "serviceRequests.language": "Sprache",
    "serviceRequests.openRequest": "Anfrage {reference} öffnen",
    "serviceRequests.dateOfBirth": "Geburtsdatum: {value}",
    "serviceRequests.pendingSlot": "Termin noch offen",

    "medicalAppointments.title": "Medizinische Termine",
    "medicalAppointments.description":
      "Terminanfragen prüfen und die gewünschten Zeitfenster verfolgen.",
    "medicalAppointments.searchPlaceholder": "Nach Anfrage, Patient, Telefon oder Termin suchen...",
    "medicalAppointments.loading": "Terminanfragen werden geladen...",
    "medicalAppointments.empty": "In diesem Arbeitsbereich sind keine Terminanfragen sichtbar.",
    "medicalAppointments.noMatches": "Keine Termine entsprechen den aktuellen Filtern.",
    "medicalAppointments.request": "Anfrage",
    "medicalAppointments.patient": "Patient",
    "medicalAppointments.phone": "Telefon",
    "medicalAppointments.clinic": "Praxis",
    "medicalAppointments.requestedSlot": "Gewünschter Termin",
    "medicalAppointments.status": "Status",
    "medicalAppointments.submittedAt": "Eingegangen am",
    "medicalAppointments.openRequest": "Termin {reference} öffnen",
    "medicalAppointments.dateLabel": "Datum",
    "medicalAppointments.timeLabel": "Uhrzeit",
    "medicalAppointments.pendingSlot": "Termin noch offen",
    "medicalAppointments.slotJoiner": " um ",

    "requestDetail.backToRequests": "Zurück zu Allgemeine Anfragen",
    "requestDetail.backToAppointments": "Zurück zu Medizinische Termine",
    "requestDetail.description": "Formatierte Klinik-Anfragedetails für den Kundenbereich.",
    "requestDetail.loading": "Anfragedetails werden geladen...",
    "requestDetail.notFound": "Der angeforderte Eintrag wurde in diesem Arbeitsbereich nicht gefunden.",
    "requestDetail.markDoneSuccess": "Anfrage wurde als erledigt markiert.",
    "requestDetail.summary": "Anfrageübersicht",
    "requestDetail.requestNumber": "Anfragenummer",
    "requestDetail.serviceNeeded": "Benötigter Service",
    "requestDetail.serviceArea": "Servicebereich",
    "requestDetail.priority": "Priorität",
    "requestDetail.personDetails": "Personendaten",
    "requestDetail.fullName": "Vollständiger Name",
    "requestDetail.phoneNumber": "Telefonnummer",
    "requestDetail.email": "E-Mail",
    "requestDetail.dateOfBirth": "Geburtsdatum",
    "requestDetail.submittedInformation": "Übermittelte Informationen",
    "requestDetail.medicalDocuments": "Medizinische Dokumente",
    "requestDetail.insuranceCardImage": "Versicherungskartenbild",
    "requestDetail.noSubmittedData": "Für diese Anfrage sind noch keine übermittelten Daten gespeichert.",
    "requestDetail.requestType": "Anfragetyp",
    "requestDetail.clinic": "Praxis",
    "requestDetail.language": "Sprache",

    "flowMessages.title": "Ablaufnachrichten",
    "flowMessages.description":
      "Bearbeiten Sie die sichtbaren WhatsApp-Texte des freigegebenen Klinikablaufs und halten Sie sie lesbar.",
    "flowMessages.summaryTitle": "Zugeordnete Nachrichtensammlung",
    "flowMessages.summaryDescription":
      "Formulierungen, Zeilenumbrüche und Übersetzungsqualität anpassen, ohne versteckte Backend-Felder zu verändern.",
    "flowMessages.openFlowSteps": "Ablaufschritte öffnen",
    "flowMessages.messageKeys": "Nachrichtenschlüssel",
    "flowMessages.configured": "Konfiguriert",
    "flowMessages.missingText": "Text fehlt",
    "flowMessages.linkedSteps": "Verknüpfte Schritte",
    "flowMessages.searchPlaceholder": "Nach Nachrichtenschlüssel oder Schrittcode suchen...",
    "flowMessages.templateStatus": "Vorlagenstatus",
    "flowMessages.loading": "Ablaufnachrichten werden geladen...",
    "flowMessages.error": "Ablaufnachrichten konnten nicht geladen werden.",
    "flowMessages.empty": "Diesem Arbeitsbereich sind keine Ablaufnachrichten zugeordnet.",
    "flowMessages.noVisibleText": "Es wurde noch kein sichtbarer Text gespeichert.",
    "flowMessages.usedInSteps": "Verwendet in {count} Schritt(en): {steps}",
    "flowMessages.editorTitle": "Nachrichteneditor",
    "flowMessages.editorHint":
      "Verwenden Sie echte Zeilenumbrüche zwischen Frage, nummerierten Optionen und Antwortanweisung. Die Formatierungsfunktion bereinigt Ein-Zeilen-Texte automatisch.",
    "flowMessages.selectMessage": "Wählen Sie einen Nachrichtenschlüssel zum Bearbeiten aus.",
    "flowMessages.formatText": "Text formatieren",
    "flowMessages.saveMessage": "Nachricht speichern",
    "flowMessages.deleteSavedText": "Gespeicherten Text löschen",
    "flowMessages.saving": "Wird gespeichert...",
    "flowMessages.deleting": "Wird gelöscht...",
    "flowMessages.saved": "Nachricht gespeichert: {key}",
    "flowMessages.deleted": "Gespeicherter Text für {key} gelöscht",
    "flowMessages.formatted": "Nachrichtentext mit Zeilenumbrüchen formatiert.",
    "flowMessages.confirmDelete": "Gespeicherten Text für diesen Schlüssel löschen?",
    "flowMessages.arabicText": "Arabischer Text (ar)",
    "flowMessages.englishText": "Englischer Text (en)",
    "flowMessages.germanText": "Deutscher Text (de)",
    "flowMessages.placeholderArabic": "Arabische WhatsApp-Nachricht eingeben...",
    "flowMessages.placeholderEnglish": "Englische WhatsApp-Nachricht eingeben...",
    "flowMessages.placeholderGerman": "Deutsche WhatsApp-Nachricht eingeben...",
    "flowMessages.linkedKey": "Schlüssel: {key}",
    "flowMessages.infoLinked":
      "Dieser Schlüssel ist mit dem ausgewählten Schritt verknüpft. Speichern Sie hier den sichtbaren Text und kehren Sie nur zu Ablaufschritten zurück, wenn Sie Routing oder Datenfeld ändern möchten.",

    "flowSteps.title": "Ablaufschritte",
    "flowSteps.description": "Den Klinikablauf Schritt für Schritt aufbauen und prüfen.",
    "flowSteps.openFlowMessages": "Ablaufnachrichten öffnen",
    "flowSteps.searchPlaceholder": "Nach Code, Typ, Feld oder verknüpfter Nachricht suchen...",
    "flowSteps.loading": "Ablaufschritte werden geladen...",
    "flowSteps.error": "Ablaufschritte konnten nicht geladen werden.",
    "flowSteps.empty": "In diesem Arbeitsbereich sind keine Ablaufschritte sichtbar.",
    "flowSteps.step": "Schritt {sequence}",
    "flowSteps.messageKey": "Nachrichtenschlüssel",
    "flowSteps.storedField": "Gespeichertes Feld",
    "flowSteps.routing": "Routing",
    "flowSteps.noMessageKey": "Noch kein Nachrichtenschlüssel verknüpft.",
    "flowSteps.noVisibleText": "Es ist noch kein sichtbarer Text hinterlegt. Speichern Sie den Text in Ablaufnachrichten.",
    "flowSteps.noStoredField": "Kein gespeichertes Feld",
    "flowSteps.noStoredFieldDescription": "Dieser Schritt speichert kein Feld in den Anfragedaten.",
    "flowSteps.choiceOptions": "{count} Optionen",
    "flowSteps.noChoiceRoutes": "Es sind noch keine Auswahlrouten konfiguriert.",
    "flowSteps.sendMessage": "Nachricht senden",
    "flowSteps.askChoice": "Auswahl abfragen",
    "flowSteps.collectTextOrMedia": "Text oder Datei erfassen",
    "flowSteps.finishFlow": "Ablauf beenden",
    "flowSteps.edit": "Bearbeiten",
    "flowSteps.delete": "Löschen",
    "flowSteps.deleting": "Wird gelöscht...",
    "flowSteps.saveChanges": "Änderungen speichern",
    "flowSteps.cancelEdit": "Bearbeiten abbrechen",
    "flowSteps.stepCode": "Schrittcode",
    "flowSteps.type": "Typ",
    "flowSteps.status": "Status",
    "flowSteps.sequence": "Reihenfolge",
    "flowSteps.dataKey": "Gespeichertes Feld",
    "flowSteps.editMessageKey": "Nachrichtenschlüssel",
    "flowSteps.choiceMap": "Auswahloptionen",
    "flowSteps.transitionConfig": "Erweitertes Routing",
    "flowSteps.openAdvancedJson": "Erweitertes JSON öffnen",
    "flowSteps.hideAdvancedJson": "Erweitertes JSON ausblenden",
    "flowSteps.saveSuccess": "Schritt erfolgreich aktualisiert.",
    "flowSteps.deleteSuccess": "Schritt erfolgreich gelöscht.",
    "flowSteps.confirmDelete": "Diesen Ablaufschritt löschen?",
    "flowSteps.summaryMessageContinue": "Sendet eine Nachricht und fährt dann mit {nextStep} fort.",
    "flowSteps.summaryMessage": "Sendet eine Nachricht innerhalb der Konversation.",
    "flowSteps.summaryChoice": "Fragt die Person zwischen {count} Optionen und speichert die Auswahl in {field}.",
    "flowSteps.summaryChoiceNoField": "Fragt die Person zwischen {count} Optionen.",
    "flowSteps.summaryInput": "Erfasst eine Text- oder Dateiantwort, speichert sie in {field} und fährt mit {nextStep} fort.",
    "flowSteps.summaryInputNoField": "Erfasst eine Text- oder Dateiantwort und fährt dann mit {nextStep} fort.",
    "flowSteps.summaryEnd": "Beendet die Konversation.",
    "flowSteps.summaryUnknown": "Verwendet eine benutzerdefinierte Schrittlogik aus dem Backend.",
    "flowSteps.fieldDescription": "Antworten aus diesem Schritt werden unter {field} gespeichert.",

    "baileys.title": "WhatsApp-Kopplung",
    "baileys.description": "Baileys-Verbindungsstatus und QR-Kopplung.",
    "baileys.controlsTitle": "Verbindungssteuerung",
    "baileys.controlsDescription": "Dieser Bereich ist auf ein freigegebenes WhatsApp-Konto begrenzt.",
    "baileys.scopedAccount": "Freigegebenes WhatsApp-Konto",
    "baileys.scopedAccountHint": "Der Kundenbereich kann nur dieses freigegebene Konto koppeln und überwachen.",
    "baileys.start": "Starten",
    "baileys.refreshStatus": "Status aktualisieren",
    "baileys.fetchQr": "QR abrufen",
    "baileys.logout": "Abmelden",
    "baileys.liveState": "Live-Status: {status}",
    "baileys.autoRefresh": "Automatische Aktualisierung alle 3 Sekunden während der Kopplung.",
    "baileys.initialized": "Initialisiert",
    "baileys.connected": "Verbunden",
    "baileys.statusLabel": "Status",
    "baileys.qrAvailable": "QR verfügbar",
    "baileys.phoneNumber": "Telefonnummer",
    "baileys.lastConnectionUpdate": "Letzte Verbindungsaktualisierung",
    "baileys.pairingQr": "Koppel-QR",
    "baileys.pairingQrDescription":
      "Scannen Sie diesen Code in WhatsApp verknüpfte Geräte, während das ausgewählte Konto verbunden wird.",
    "baileys.noQr": "Zurzeit ist kein aktiver QR verfügbar. Starten Sie die Verbindung und warten Sie auf die automatische Aktualisierung.",
    "baileys.connectedNoQr": "Dieses Konto ist bereits verbunden. Kein QR erforderlich.",
    "baileys.startRequested": "Baileys-Startanforderung gesendet. Die Seite aktualisiert sich während der Kopplung automatisch.",
    "baileys.connectedBanner": "WhatsApp ist verbunden. Eingehende Textnachrichten können jetzt durch den bestehenden Laufzeitablauf gehen.",
    "baileys.loadingAccounts": "Kanal-Konten werden geladen...",
    "baileys.noAccounts": "Es wurden keine Kanal-Konten gefunden. Erstellen Sie ein WhatsApp-kompatibles Konto, bevor Sie koppeln.",
    "baileys.selectAccountFirst": "Wählen Sie zuerst ein Kanal-Konto aus.",
    "baileys.channelAccount": "Kanal-Konto",
    "baileys.selectChannelAccount": "Kanal-Konto auswählen",
    "baileys.noScopedAccount": "Für diesen Bereich ist kein Kanal-Konto verfügbar.",
    "baileys.chooseAccountHelp": "Wählen Sie das Kanal-Konto aus, dem die WhatsApp-Gerätesitzung gehören soll.",
    "baileys.selectedAccount": "Ausgewählt: {account}",
    "baileys.fetchedQr": "Aktueller Kopplungs-QR wurde abgerufen.",
    "baileys.loggedOut": "Baileys-Verbindung erfolgreich abgemeldet.",
    "baileys.startTimeout": "Die Startanforderung hat das Browser-Timeout überschritten, aber die Baileys-Initialisierung läuft möglicherweise weiter. Die Seite fragt Status und QR weiter ab.",
    "baileys.fetchingQr": "QR wird abgerufen...",
    "baileys.loggingOut": "Wird abgemeldet...",

    "gemini.title": "Gemini-Assistent",
    "gemini.description": "OCR-Prompt für Versicherungskarten und KI-Werkzeuge verwalten.",
    "gemini.studioTitle": "Gemini Studio",
    "gemini.studioDescription":
      "Den OCR-Prompt für Versicherungskarten verwalten, der im Klinik-WhatsApp-Bereich verwendet wird.",
    "gemini.promptTitle": "OCR-Prompt für Versicherungskarten",
    "gemini.promptDescription":
      "Dieser Prompt steuert, wie Gemini Versicherungskartenbilder aus WhatsApp validiert und liest.",
    "gemini.promptText": "Prompt-Text",
    "gemini.savePrompt": "Prompt speichern",
    "gemini.resetPrompt": "Auf Standard zurücksetzen",
    "gemini.defaultPreview": "Standardvorschau",
    "gemini.resetHint": "Zurücksetzen stellt genau den Backend-Standardprompt wieder her, keine Frontend-Kopie.",
    "gemini.saved": "OCR-Prompt gespeichert.",
    "gemini.reset": "OCR-Prompt auf Backend-Standard zurückgesetzt.",
    "gemini.loadingPrompt": "OCR-Prompt wird geladen...",
    "gemini.currentLines": "Aktuelle Zeilen",
    "gemini.currentCharacters": "Aktuelle Zeichen",
    "gemini.defaultLines": "Standardzeilen",
    "gemini.defaultCharacters": "Standardzeichen",
    "gemini.saving": "Wird gespeichert...",
    "gemini.resetting": "Wird zurückgesetzt...",
    "gemini.adminStudioDescription": "OCR-Prompt für Versicherungskarten verwalten und Gemini direkt aus dem Admin-Dashboard verwenden.",
  },
};

const ClientLocaleContext = createContext<ClientLocaleContextValue | undefined>(undefined);

function getStorageKey(username: string | undefined): string | null {
  if (!username) {
    return null;
  }

  return `${STORAGE_KEY_PREFIX}:${username.toLowerCase()}`;
}

function getInitialLanguage(username: string | undefined): ClientLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const storageKey = getStorageKey(username);
  if (!storageKey) {
    return DEFAULT_LANGUAGE;
  }

  const stored = window.localStorage.getItem(storageKey);
  if (stored === "ar" || stored === "de" || stored === "en") {
    return stored;
  }

  return DEFAULT_LANGUAGE;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = params[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

export function ClientLocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isClientUser = user?.role === "user";

  const [languageState, setLanguageState] = useState<ClientLanguageState>(() => ({
    username: user?.username,
    language: getInitialLanguage(user?.username),
  }));
  const language =
    languageState.username === user?.username
      ? languageState.language
      : getInitialLanguage(user?.username);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getStorageKey(user?.username);
    if (storageKey && isClientUser) {
      window.localStorage.setItem(storageKey, language);
    }
  }, [isClientUser, language, user?.username]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;

    if (isClientUser) {
      html.lang = language;
      html.dir = language === "ar" ? "rtl" : "ltr";
      body.classList.toggle("dashboard-rtl", language === "ar");
    } else {
      html.lang = "en";
      html.dir = "ltr";
      body.classList.remove("dashboard-rtl");
    }

    return () => {
      body.classList.remove("dashboard-rtl");
      html.lang = "en";
      html.dir = "ltr";
    };
  }, [isClientUser, language]);

  const setLanguage = useCallback(
    (nextLanguage: ClientLanguage) => {
      if (!isClientUser) {
        return;
      }

      setLanguageState({ username: user?.username, language: nextLanguage });
    },
    [isClientUser, user?.username],
  );

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const activeLanguage = isClientUser ? language : DEFAULT_LANGUAGE;
      const dictionary = translations[activeLanguage];
      const fallbackDictionary = translations[DEFAULT_LANGUAGE];
      const template = dictionary[key] ?? fallbackDictionary[key] ?? key;
      return interpolate(template, params);
    },
    [isClientUser, language],
  );

  const value = useMemo<ClientLocaleContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      isClientUser,
    }),
    [isClientUser, language, setLanguage, t],
  );

  return <ClientLocaleContext.Provider value={value}>{children}</ClientLocaleContext.Provider>;
}

export function useClientLocale(): ClientLocaleContextValue {
  const context = useContext(ClientLocaleContext);

  if (!context) {
    throw new Error("useClientLocale must be used inside ClientLocaleProvider");
  }

  return context;
}
