document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form') as HTMLFormElement;

  form.addEventListener('submit', (event: Event) => {
    let isValid = true;

    // Validate Passwords
    const passwordInput = document.querySelector('#password') as HTMLInputElement;
    const confirmPasswordInput = document.querySelector('#confirm-password') as HTMLInputElement;

    const passwordFieldset = passwordInput.closest('.govuk-form-group') as HTMLElement;
    const passwordErrorElement = passwordFieldset?.querySelector('.govuk-error-message') as HTMLElement | null;

    // Remove existing error styles and messages for passwords
    passwordFieldset?.classList.remove('govuk-form-group--error');
    passwordErrorElement?.remove();

    const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    let passwordErrorMessage = '';

    if (!passwordInput?.value) {
      passwordErrorMessage = 'Please enter a password.';
    } else if (!passwordCriteriaRegex.test(passwordInput.value)) {
      passwordErrorMessage = 'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.';
    } else if (passwordInput?.value !== confirmPasswordInput?.value) {
      passwordErrorMessage = 'Passwords do not match.';
    }

    if (passwordErrorMessage) {
      isValid = false;

      passwordFieldset?.classList.add('govuk-form-group--error');
      const errorMessage = document.createElement('p');
      errorMessage.className = 'govuk-error-message';
      errorMessage.id = 'password-error';
      errorMessage.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${passwordErrorMessage}`;
      passwordFieldset?.querySelector('label')?.insertAdjacentElement('afterend', errorMessage);
    }

    if (!isValid) {
      event.preventDefault();
    }
  });
});
