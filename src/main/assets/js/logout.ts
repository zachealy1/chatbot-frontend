document.addEventListener('DOMContentLoaded', () => {
  const logoutLink = document.getElementById('logoutLink') as HTMLAnchorElement;

  if (logoutLink) {
    logoutLink.addEventListener('click', (event: MouseEvent) => {
      const userConfirmed = confirm('Are you sure you want to log out?');
      if (!userConfirmed) {
        // Prevent navigation if the user cancels
        event.preventDefault();
      }
    });
  } else {
    console.error('Logout link is missing from the DOM.');
  }
});
