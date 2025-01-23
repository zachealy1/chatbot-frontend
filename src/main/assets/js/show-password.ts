document.addEventListener('DOMContentLoaded', () => {
  // Query all toggle buttons
  const toggleButtons = document.querySelectorAll<HTMLButtonElement>('.toggle-button');

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // Find the input associated with this button
      const passwordInput = button.previousElementSibling as HTMLInputElement;

      if (!passwordInput || passwordInput.tagName !== 'INPUT') {
        // If no input is found or the sibling is not an input field, exit early
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
