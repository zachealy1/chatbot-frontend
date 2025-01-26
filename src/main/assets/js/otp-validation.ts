// Assuming you're using TypeScript and compiling it to JavaScript

document.addEventListener('DOMContentLoaded', () => {
  console.log('OTP Validation script loaded.');

  const form = document.querySelector('form') as HTMLFormElement | null;
  const otpInput = document.querySelector('#one-time-password') as HTMLInputElement | null;
  const otpGroup = document.querySelector('#otp-group') as HTMLDivElement | null;

  // Buttons
  const continueButton = document.querySelector('#continue-button') as HTMLButtonElement | null;
  const resendButton = document.querySelector('#resend-button') as HTMLButtonElement | null;

  // Variable to track which button was clicked
  let clickedButton: 'continue' | 'resend' | null = null;

  // Ensure the form and input are present
  if (!form || !otpInput || !otpGroup || !continueButton || !resendButton) {
    console.error('Form, OTP input, OTP group, or buttons not found');
    return;
  }

  // Event listeners for buttons to set the clickedButton variable
  continueButton.addEventListener('click', () => {
    clickedButton = 'continue';
    console.log('Continue button clicked.');
  });

  resendButton.addEventListener('click', () => {
    clickedButton = 'resend';
    console.log('Resend Email button clicked.');
  });

  form.addEventListener('submit', (event) => {
    console.log('Form submitted.');
    if (clickedButton === 'resend') {
      console.log('Resend action detected. Skipping OTP validation.');
      // Reset the clickedButton after handling
      clickedButton = null;
      return; // Skip validation
    }

    // Proceed with OTP validation
    let isValid = true;
    const otpValue = otpInput.value.trim(); // Use otpInput as HTMLInputElement

    // Remove existing error message and styling
    const existingError = otpGroup.querySelector('#one-time-password-error') as HTMLElement | null;
    if (existingError) { existingError.remove(); }

    otpInput.classList.remove('govuk-input--error');
    otpInput.setAttribute('aria-describedby', 'one-time-password-hint');
    otpGroup.classList.remove('govuk-form-group--error');

    // Validate OTP (6-digit numeric value)
    const otpRegex = /^\d{6}$/;
    if (!otpRegex.test(otpValue)) {
      isValid = false;

      // Add error styling
      otpInput.classList.add('govuk-input--error');
      otpInput.setAttribute('aria-describedby', 'one-time-password-hint one-time-password-error');
      otpGroup.classList.add('govuk-form-group--error');

      // Add error message
      const errorMessage = document.createElement('p');
      errorMessage.id = 'one-time-password-error';
      errorMessage.className = 'govuk-error-message';
      errorMessage.innerHTML =
        '<span class="govuk-visually-hidden">Error:</span> Enter a valid 6-digit one-time password.';
      otpGroup.insertBefore(errorMessage, otpInput);
    }

    if (!isValid) {
      event.preventDefault(); // Prevent form submission
      otpInput.focus(); // Focus on the input field
      console.log('OTP validation failed. Form submission prevented.');
    } else {
      console.log('OTP validation passed. Form will be submitted.');
    }

    // Reset the clickedButton after handling
    clickedButton = null;
  });
});
