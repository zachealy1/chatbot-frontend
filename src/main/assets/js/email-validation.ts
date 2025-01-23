document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form') as HTMLFormElement;

  form.addEventListener('submit', (event: Event) => {
    let isValid = true;

    // Validate Email
    const emailInput = document.querySelector("input[name='email']") as HTMLInputElement;
    const emailFieldset = emailInput.closest('.govuk-form-group') as HTMLElement;
    const emailErrorElement = emailFieldset?.querySelector('.govuk-error-message') as HTMLElement | null;

    // Remove existing error styles and messages for email
    emailFieldset?.classList.remove('govuk-form-group--error');
    emailErrorElement?.remove();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email validation regex
    if (!emailRegex.test(emailInput.value)) {
      isValid = false;

      emailFieldset?.classList.add('govuk-form-group--error');
      const errorMessage = document.createElement('p');
      errorMessage.className = 'govuk-error-message';
      errorMessage.id = 'email-error';
      errorMessage.innerHTML = '<span class="govuk-visually-hidden">Error:</span> Please enter a valid email address.';
      emailFieldset?.insertAdjacentElement('afterbegin', errorMessage);
    }

    if (!isValid) {
      event.preventDefault();
    }
  });
});
