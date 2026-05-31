(async () => {
  // Redirect if already logged in
  try {
    const { user } = await API.auth.me();
    window.location.href = user.role === 'super-admin' ? '/admin' : '/dashboard';
  } catch { /* not logged in — stay here */ }

  const tabLogin    = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm   = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError  = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add('show');
  }
  function clearError(el) { el.classList.remove('show'); }

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('d-none');
    registerForm.classList.add('d-none');
    clearError(loginError);
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('d-none');
    loginForm.classList.add('d-none');
    clearError(registerError);
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginError);
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const { user } = await API.auth.login({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      });
      window.location.href = user.role === 'super-admin' ? '/admin' : '/dashboard';
    } catch (err) {
      showError(loginError, err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(registerError);
    const password = document.getElementById('regPassword').value;
    const confirm  = document.getElementById('regConfirm').value;
    if (password !== confirm) { showError(registerError, 'Passwords do not match.'); return; }

    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      const { user } = await API.auth.register({
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password,
      });
      window.location.href = user.role === 'super-admin' ? '/admin' : '/dashboard';
    } catch (err) {
      showError(registerError, err.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
})();
