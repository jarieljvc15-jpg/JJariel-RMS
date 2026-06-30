(function () {
  async function validateStoredAdminToken() {
    const token = localStorage.getItem('adminToken');

    if (!token) {
      window.location.href = '../index.html';
      return false;
    }

    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'validateAdminToken', adminToken: token })
      });
      const json = await res.json();

      if (json.success) return true;
    } catch (err) {
      // Treat validation errors as stale/invalid credentials.
    }

    localStorage.removeItem('adminToken');
    window.location.href = '../index.html';
    return false;
  }

  window.validateStoredAdminToken = validateStoredAdminToken;
})();
