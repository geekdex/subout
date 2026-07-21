import { ref, reactive } from "vue";

export const API_BASE = "";
export const token = ref(localStorage.getItem("admin_token") || "");

export const stats = ref({ subs: 0, nodes: 0, groups: 0 });
export const subscriptions = ref([]);
export const groups = ref([]);

export const toast = reactive({
  message: "",
  type: "success",
  show: false,
});

let toastTimer = null;

export function showToast(message, type = "success") {
  toast.message = message;
  toast.type = type;
  toast.show = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.show = false;
  }, 3000);
}

export function logout() {
  token.value = "";
  localStorage.removeItem("admin_token");
  showToast("已安全退出", "success");
  window.location.hash = "dashboard";
}

// Global Dialog State
export const dialog = reactive({
  show: false,
  type: "confirm", // "confirm" | "prompt"
  title: "",
  message: "",
  inputValue: "",
  confirmText: "确定",
  cancelText: "取消",
  isDanger: false,
  resolve: null,
});

/**
 * Custom Confirmation Dialog
 * @param {string} message - The question or notice message
 * @param {object} options - Options
 * @param {string} options.title - Dialog Title
 * @param {string} options.confirmText - Confirm Button Text
 * @param {string} options.cancelText - Cancel Button Text
 * @param {boolean} options.isDanger - Whether the action is destructive (e.g. Delete)
 * @returns {Promise<boolean>}
 */
export function confirmDialog(
  message,
  {
    title = "操作确认",
    confirmText = "确定",
    cancelText = "取消",
    isDanger = false,
  } = {},
) {
  return new Promise((resolve) => {
    dialog.type = "confirm";
    dialog.title = title;
    dialog.message = message;
    dialog.confirmText = confirmText;
    dialog.cancelText = cancelText;
    dialog.isDanger = isDanger;
    dialog.inputValue = "";
    dialog.resolve = resolve;
    dialog.show = true;
  });
}

/**
 * Custom Prompt Dialog
 * @param {string} message - Label message above prompt input
 * @param {string} defaultValue - Default value of input
 * @param {object} options - Options
 * @param {string} options.title - Dialog Title
 * @param {string} options.confirmText - Confirm Button Text
 * @param {string} options.cancelText - Cancel Button Text
 * @returns {Promise<string|null>}
 */
export function promptDialog(
  message,
  defaultValue = "",
  { title = "输入内容", confirmText = "确定", cancelText = "取消" } = {},
) {
  return new Promise((resolve) => {
    dialog.type = "prompt";
    dialog.title = title;
    dialog.message = message;
    dialog.inputValue = defaultValue;
    dialog.confirmText = confirmText;
    dialog.cancelText = cancelText;
    dialog.isDanger = false;
    dialog.resolve = resolve;
    dialog.show = true;
  });
}
