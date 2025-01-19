document.addEventListener('DOMContentLoaded', () => {
  // Query all toggle buttons
  const toggleButtons = document.querySelectorAll<HTMLButtonElement>('.toggle-button');

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // Get the parent container
      const container = button.parentElement;
      if (!container) {
        // If there's no parent element, exit early
        return;
      }

      // Query for the input within this container
      const passwordInput = container.querySelector<HTMLInputElement>('input');
      if (!passwordInput) {
        // If no input found, exit early
        return;
      }

      // Check if currently type="password"
      const isPassword = passwordInput.type === 'password';

      // Toggle type between "password" and "text"
      passwordInput.type = isPassword ? 'text' : 'password';

      // Update button text
      button.textContent = isPassword ? 'Hide' : 'Show';

      // Update aria-expanded for accessibility
      button.setAttribute('aria-expanded', String(!isPassword));
    });
  });
});
