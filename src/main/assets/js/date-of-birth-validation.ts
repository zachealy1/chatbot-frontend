document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form') as HTMLFormElement;

  form.addEventListener('submit', (event: Event) => {
    let isValid = true;

    // Validate Date of Birth
    const dayInput = document.querySelector("input[name='date-of-birth-day']") as HTMLInputElement;
    const monthInput = document.querySelector("input[name='date-of-birth-month']") as HTMLInputElement;
    const yearInput = document.querySelector("input[name='date-of-birth-year']") as HTMLInputElement;

    const dobFieldset = document.querySelector('#date-of-birth')?.closest('.govuk-form-group') as HTMLElement;
    const dobErrorElement = dobFieldset?.querySelector('.govuk-error-message') as HTMLElement | null;

    const day = parseInt(dayInput?.value || '0', 10);
    const month = parseInt(monthInput?.value || '0', 10);
    const year = parseInt(yearInput?.value || '0', 10);

    // Remove existing error styles and messages
    dobFieldset?.classList.remove('govuk-form-group--error');
    dobErrorElement?.remove();

    let dobErrorMessage = '';

    if (!dayInput.value || !monthInput.value || !yearInput.value) {
      dobErrorMessage = 'Please enter a valid date of birth.';
    } else if (
      isNaN(day) ||
      isNaN(month) ||
      isNaN(year) ||
      day <= 0 ||
      day > 31 ||
      month <= 0 ||
      month > 12 ||
      year <= 1900
    ) {
      dobErrorMessage = 'The date of birth entered is not valid.';
    } else {
      const dateOfBirth = new Date(year, month - 1, day);
      const today = new Date();

      if (dateOfBirth >= today) {
        dobErrorMessage = 'The date of birth must be in the past.';
      }
    }

    if (dobErrorMessage) {
      isValid = false;

      dobFieldset?.classList.add('govuk-form-group--error');
      const errorMessage = document.createElement('p');
      errorMessage.className = 'govuk-error-message';
      errorMessage.id = 'date-of-birth-error';
      errorMessage.innerHTML = `<span class="govuk-visually-hidden">Error:</span> ${dobErrorMessage}`;
      dobFieldset?.querySelector('.govuk-fieldset')?.insertAdjacentElement('afterbegin', errorMessage);
    }

    if (!isValid) {
      event.preventDefault();
    }
  });
});
