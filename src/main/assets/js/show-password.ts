// src/showPassword.ts

document.addEventListener('DOMContentLoaded', () => {
  console.log('Show Password script loaded.');

  // Query all toggle buttons
  const toggleButtons = document.querySelectorAll<HTMLButtonElement>('.toggle-button');

  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Get the target input ID from data attribute
      const targetId = button.getAttribute('data-target');
      if (!targetId) {
        console.warn('No data-target attribute found on button:', button);
        return;
      }

      const passwordInput = document.getElementById(targetId) as HTMLInputElement | null;

      if (!passwordInput || passwordInput.tagName !== 'INPUT') {
        console.warn(`No input found with id "${targetId}" or element is not an input.`);
        return;
      }

      // Check if the input is currently type="password"
      const isPassword = passwordInput.type === 'password';

      // Toggle the input type between "password" and "text"
      passwordInput.type = isPassword ? 'text' : 'password';

      // Update the button text
      button.textContent = isPassword ? 'Hide' : 'Show';

      // Update aria-expanded attribute for accessibility
      button.setAttribute('aria-expanded', String(!isPassword));
    });
  });
});
