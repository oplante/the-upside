/* Posts the signup form to MailerLite's form endpoint without leaving the page.
   No cookies, no analytics. Without JS the form still posts normally. */
(function () {
  var form = document.getElementById('signup-form');
  if (!form || !window.fetch) return;
  var box = document.getElementById('signup');
  var input = document.getElementById('signup-email');
  var msg = document.getElementById('signup-msg');
  var button = form.querySelector('button[type="submit"]');
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function say(text, ok) {
    msg.textContent = text;
    msg.className = 'signup-msg ' + (ok ? 'is-ok' : 'is-error');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!EMAIL.test(email)) {
      input.setAttribute('aria-invalid', 'true');
      say('Please enter a valid email address.', false);
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    button.disabled = true;
    button.textContent = 'Signing up…';
    say('', true);
    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.success) {
        box.classList.add('is-done');
        say('Nearly there. Check your inbox for a confirmation link from The Upside.', true);
      } else {
        var err = data && data.errors && data.errors.fields && data.errors.fields.email;
        input.setAttribute('aria-invalid', 'true');
        say(err ? 'That email address doesn’t look right. Please check it.' : 'Something went wrong. Please try again in a minute.', false);
      }
    }).catch(function () {
      say('Couldn’t reach the sign-up service. Please try again in a minute.', false);
    }).then(function () {
      button.disabled = false;
      button.textContent = 'Sign up';
    });
  });
})();
