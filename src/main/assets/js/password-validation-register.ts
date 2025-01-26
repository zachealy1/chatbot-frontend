document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form') as HTMLFormElement;

  form.addEventListener('submit', (event: Event) => {
    let isValid = true;

    const passwordInput = document.querySelector('#password') as HTMLInputElement;
    const confirmPasswordInput = document.querySelector('#confirm-password') as HTMLInputElement;

    const passwordFieldset = passwordInput.closest('.govuk-form-group') as HTMLElement;

    passwordFieldset?.classList.remove('govuk-form-group--error');
    const existingError = passwordFieldset?.querySelector('.govuk-error-message');
    existingError?.remove();

    const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (!passwordInput.value) {
      isValid = false;
      showError(passwordFieldset, 'Please enter a password.');
    } else if (!passwordCriteriaRegex.test(passwordInput.value)) {
      isValid = false;
      showError(
        passwordFieldset,
        'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.'
      );
    } else if (passwordInput.value !== confirmPasswordInput.value) {
      isValid = false;
      showError(passwordFieldset, 'Passwords do not match.');
    }

    if (!isValid) {
      event.preventDefault();
    }
  });

  function showError(fieldset: HTMLElement, message: string) {
    fieldset.classList.add('govuk-form-group--error');
    const errorMessage = document.createElement('p');
    errorMessage.className = 'govuk-error-message';
    errorMessage.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${message}`;
    fieldset.querySelector('label')?.insertAdjacentElement('afterend', errorMessage);
  }
});
