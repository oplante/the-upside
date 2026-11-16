/* Posts the signup form to MailerLite's form endpoint without leaving the page.
   No cookies, no analytics. Works for every copy of the form on the page
   (app.js places one after the 6th card and one at the end of the feed):
   one delegated submit listener, and each form finds its own input/message. */
(function () {
  if (!window.fetch || !document.addEventListener) return;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function say(msg, text, ok) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'signup-msg ' + (ok ? 'is-ok' : 'is-error');
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.classList || !form.classList.contains('signup-form')) return;
    e.preventDefault();
    var box = form.closest('.signup');
    var input = form.querySelector('.signup-input');
    var msg = form.querySelector('.signup-msg');
    var button = form.querySelector('button[type="submit"]');
    var email = input ? input.value.trim() : '';
    if (!EMAIL.test(email)) {
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
      say(msg, 'Please enter a valid email address.', false);
      return;
    }
    input.removeAttribute('aria-invalid');
    button.disabled = true;
    button.textContent = 'Signing up…';
    say(msg, '', true);
    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.success) {
        if (box) box.classList.add('is-done');
        say(msg, 'Nearly there. Check your inbox for a confirmation link from The Upside.', true);
      } else {
        var err = data && data.errors && data.errors.fields && data.errors.fields.email;
        input.setAttribute('aria-invalid', 'true');
        say(msg, err ? 'That email address doesn’t look right. Please check it.' : 'Something went wrong. Please try again in a minute.', false);
      }
    }).catch(function () {
      say(msg, 'Couldn’t reach the sign-up service. Please try again in a minute.', false);
    }).then(function () {
      button.disabled = false;
      button.textContent = 'Sign up';
    });
  });
})();
