const doctorSelect = document.querySelector("#doctorLoginSelect");
const loginForm = document.querySelector("#doctorLoginForm");
const loginButton = document.querySelector("#doctorLoginButton");
const message = document.querySelector("#doctorLoginMessage");
const toast = document.querySelector("#toast");
const doctorGoogleLogin = document.querySelector("#doctorGoogleLogin");
const doctorMobileLoginButton = document.querySelector("#doctorMobileLoginButton");
const doctorMobileNumber = document.querySelector("#doctorMobileNumber");

const RENDER_API_BASE = "https://dishahealthq-c7gv.onrender.com";
const PUBLIC_WEBSITE_HOSTS = new Set(["dishahealthq.in", "www.dishahealthq.in"]);
const API_BASE = PUBLIC_WEBSITE_HOSTS.has(window.location.hostname) ? RENDER_API_BASE : "";

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

function apiCredentials() {
  return API_BASE ? "include" : "same-origin";
}

async function initDoctorLogin() {
  await checkExistingSession();
  await loadApprovedDoctors();
  bindEvents();
  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

async function checkExistingSession() {
  try {
    const response = await fetch(apiUrl("/api/doctor/session"), { credentials: apiCredentials() });
    const payload = await response.json();
    if (payload.authenticated) {
      sessionStorage.setItem("doctorCsrfToken", payload.csrfToken || "");
      showToast("Doctor session active. Redirecting dashboard...");
      window.setTimeout(() => {
        window.location.href = "doctor-dashboard.html";
      }, 600);
    }
  } catch {
    // Login form remains usable.
  }
}

async function loadApprovedDoctors() {
  try {
    const response = await fetch(apiUrl("/api/doctors"), { credentials: apiCredentials() });
    const payload = await response.json();
    const doctors = payload.doctors || [];
    if (!doctors.length) {
      doctorSelect.innerHTML = `<option value="">No approved doctors available</option>`;
      return;
    }
    doctorSelect.innerHTML = doctors.map((doctor) => (
      `<option value="${escapeHtml(doctor.id)}">${escapeHtml(doctor.name)} - ${escapeHtml(doctor.specialty)}</option>`
    )).join("");
  } catch {
    doctorSelect.innerHTML = `<option value="">Backend unavailable</option>`;
  }
}

function bindEvents() {
  doctorGoogleLogin?.addEventListener("click", () => {
    showAuthMessage("Google login UI is ready. Add Google OAuth client keys and approved doctor email matching to enable live sign-in.");
  });

  doctorMobileLoginButton?.addEventListener("click", () => {
    const phone = doctorMobileNumber?.value.replace(/\D/g, "") || "";
    if (phone.length < 10) {
      showAuthMessage("Enter a valid 10 digit doctor mobile number.");
      return;
    }
    try {
      sessionStorage.setItem("dhq:doctorMobileLoginIntent", JSON.stringify({
        phone: `${phone.slice(0, 2)}******${phone.slice(-2)}`,
        createdAt: new Date().toISOString()
      }));
    } catch {
      // Session storage is optional.
    }
    showAuthMessage("Mobile login UI is ready. Connect an SMS OTP provider before enabling live doctor verification.");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    loginButton.disabled = true;
    loginButton.textContent = "Checking...";
    try {
      const response = await fetch(apiUrl("/api/doctor/session"), {
        method: "POST",
        credentials: apiCredentials(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: doctorSelect.value,
          accessCode: document.querySelector("#doctorAccessCode").value
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.authenticated) {
        throw new Error(payload?.message || "Doctor login failed.");
      }
      sessionStorage.setItem("doctorCsrfToken", payload.csrfToken || "");
      showToast("Doctor login successful.");
      window.location.href = "doctor-dashboard.html";
    } catch (error) {
      message.textContent = error.message || "Login failed.";
      showToast(message.textContent);
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Open Dashboard";
    }
  });
}

function showAuthMessage(text) {
  if (message) message.textContent = text;
  showToast(text);
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

initDoctorLogin();
