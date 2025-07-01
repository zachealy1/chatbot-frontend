import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM fully loaded and parsed');

  // Find the container element that holds the data attribute for chatId.
  const chatContainer = document.getElementById('chat-container');
  let currentChatId: number | null = null;

  // If chatId is present in the data attribute, parse it as a number.
  if (chatContainer) {
    const chatIdAttr = chatContainer.getAttribute('data-chat-id');
    if (chatIdAttr) {
      const parsedId = parseInt(chatIdAttr, 10);
      if (!isNaN(parsedId)) {
        currentChatId = parsedId;
        console.log('Loaded existing chatId from data attribute:', currentChatId);
      }
    }
  }

  // Create a cookie jar
  const jar = new CookieJar();

  // Create an axios client with cookie jar support and proper XSRF configuration
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',
    })
  );

  // Grab DOM elements
  const sendButton = document.getElementById('send-button') as HTMLButtonElement | null;
  const chatBox = document.getElementById('chat-box') as HTMLElement | null;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement | null;

  // Check for required elements
  if (!sendButton || !chatBox || !chatInput) {
    console.error('One or more required elements are missing.');
    return;
  }

  // Function to scroll the chat box to the bottom
  function scrollToBottom(): void {
    if (chatBox) {
      chatBox.scrollTo(0, chatBox.scrollHeight);
      console.log('Scrolling to the bottom of the chat box');
    }
  }

  // Function to create and append a chat message (user or bot) with text content
  function appendChatMessage(profileImgSrc: string, username: string, message: string, isUser = true): void {
    // Create a container for the profile
    const profileContainer = document.createElement('div');
    profileContainer.classList.add('govuk-chat-profile');

    // Create and append profile image
    const profileImg = document.createElement('img');
    profileImg.src = profileImgSrc;
    profileImg.alt = `${username} profile picture`;
    profileImg.classList.add('govuk-chat-profile-picture');
    profileContainer.appendChild(profileImg);

    // Create and append username span
    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('govuk-chat-username');
    usernameSpan.textContent = username;
    profileContainer.appendChild(usernameSpan);

    // Create message container
    const messageContainer = document.createElement('div');
    messageContainer.classList.add(
      'govuk-chat-message',
      isUser ? 'govuk-chat-message--user' : 'govuk-chat-message--bot'
    );

    // Create a visually hidden label for accessibility
    const visuallyHiddenSpan = document.createElement('span');
    visuallyHiddenSpan.classList.add('govuk-visually-hidden');
    visuallyHiddenSpan.textContent = isUser ? 'User:' : `${username}:`;
    messageContainer.appendChild(visuallyHiddenSpan);

    // Create and append message paragraph
    const messageParagraph = document.createElement('p');
    messageParagraph.textContent = message;
    messageContainer.appendChild(messageParagraph);

    // Append the profile and message containers to the chat box
    if (chatBox) {
      chatBox.appendChild(profileContainer);
      chatBox.appendChild(messageContainer);
      scrollToBottom();
    }
  }

  /**
   * Creates a placeholder bot message with a loading spinner
   * and returns the paragraph element so we can update it later.
   */
  function appendBotMessageWithSpinner(profileImgSrc: string, username: string): HTMLElement {
    // Create a container for the profile
    const profileContainer = document.createElement('div');
    profileContainer.classList.add('govuk-chat-profile');

    // Create and append profile image
    const profileImg = document.createElement('img');
    profileImg.src = profileImgSrc;
    profileImg.alt = `${username} profile picture`;
    profileImg.classList.add('govuk-chat-profile-picture');
    profileContainer.appendChild(profileImg);

    // Create and append username span
    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('govuk-chat-username');
    usernameSpan.textContent = username;
    profileContainer.appendChild(usernameSpan);

    // Create message container
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('govuk-chat-message', 'govuk-chat-message--bot');

    // Create a visually hidden label
    const visuallyHiddenSpan = document.createElement('span');
    visuallyHiddenSpan.classList.add('govuk-visually-hidden');
    visuallyHiddenSpan.textContent = `${username}:`;
    messageContainer.appendChild(visuallyHiddenSpan);

    // Create the message paragraph with a spinner image as a placeholder
    const messageParagraph = document.createElement('p');
    const spinner = document.createElement('img');
    spinner.src = '/assets/images/spinner.gif'; // Ensure this file exists or adjust path
    spinner.alt = 'Loading...';
    spinner.classList.add('spinner');
    messageParagraph.appendChild(spinner);

    messageContainer.appendChild(messageParagraph);

    // Append everything to the chat box
    if (chatBox) {
      chatBox.appendChild(profileContainer);
      chatBox.appendChild(messageContainer);
      scrollToBottom();
    }

    // Return the paragraph element so we can update its content later
    return messageParagraph;
  }

  // Attach click event to the send button
  sendButton.addEventListener('click', function () {
    console.log('Send button clicked');

    const message = chatInput.value.trim();
    if (!message) {
      console.log('No message entered');
      return;
    }

    console.log('User message:', message);

    // Append the user's message to the chat box
    appendChatMessage('/assets/images/user-profile.jpg', 'You', message, true);

    // Clear the input field
    chatInput.value = '';
    scrollToBottom();

    // Append a placeholder bot message with a spinner
    const botMessageElem = appendBotMessageWithSpinner('/assets/images/chatbot-profile.jpg', 'Chatbot');

    // Prepare the payload
    // If we have a currentChatId, include it; otherwise, just send the message
    const payload: any = { message };
    if (currentChatId !== null) {
      payload.chatId = currentChatId;
    }

    // Make a POST request to the chat backend route
    client
      .post('/chat', payload)
      .then(response => {
        console.log('Chat response:', response.data);
        const data = response.data;

        // If the backend returns a chatId (e.g., for a new chat), store it.
        if (data.chatId) {
          currentChatId = data.chatId;
          console.log('Updating currentChatId to:', currentChatId);
        }

        // Update the spinner placeholder with the chatbot's actual reply
        botMessageElem.innerHTML = data.message;
        scrollToBottom();
      })
      .catch(error => {
        console.error('Error sending chat message:', error);
        // Update the placeholder element with an error message
        botMessageElem.innerHTML = 'Sorry, an error occurred. Please try again later.';
        scrollToBottom();
      });
  });

  // Scroll to the bottom on page load
  scrollToBottom();

  // Optional: Auto-scroll when new messages are added
  const observer = new MutationObserver(() => {
    scrollToBottom();
  });
  if (chatBox) {
    observer.observe(chatBox, { childList: true });
  }
});
