document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM fully loaded and parsed");

  // Grab elements
  const sendButton = document.getElementById("send-button");
  const chatBox = document.getElementById("chat-box");
  const chatInput = document.getElementById("chat-input");

  // Function to scroll to the bottom of the chat box
  function scrollToBottom() {
    chatBox.scrollTo(0, document.body.scrollHeight);
    console.log("Scrolling to the bottom of the chat box");
  }

  // Attach click event to send button
  sendButton.addEventListener("click", function () {
    console.log("Send button clicked");

    const message = chatInput.value.trim();

    if (message) {
      console.log("User message:", message);

      // Create chat message container
      const chatMessageContainer = document.createElement("div");
      chatMessageContainer.classList.add("govuk-chat-profile");

      // Create user profile picture
      const userProfileImg = document.createElement("img");
      userProfileImg.src = "/assets/images/user-profile.jpg";
      userProfileImg.alt = "User profile picture";
      userProfileImg.classList.add("govuk-chat-profile-picture");

      // Create username span
      const usernameSpan = document.createElement("span");
      usernameSpan.classList.add("govuk-chat-username");
      usernameSpan.textContent = "You";

      // Append profile picture and username to container
      chatMessageContainer.appendChild(userProfileImg);
      chatMessageContainer.appendChild(usernameSpan);

      // Create message element
      const chatMessage = document.createElement("div");
      chatMessage.classList.add("govuk-chat-message", "govuk-chat-message--user");

      const visuallyHiddenSpan = document.createElement("span");
      visuallyHiddenSpan.classList.add("govuk-visually-hidden");
      visuallyHiddenSpan.textContent = "User:";

      const messageParagraph = document.createElement("p");
      messageParagraph.textContent = message;

      // Append visually hidden span and message to chat message
      chatMessage.appendChild(visuallyHiddenSpan);
      chatMessage.appendChild(messageParagraph);

      // Append elements to chat box
      chatBox.appendChild(chatMessageContainer);
      chatBox.appendChild(chatMessage);

      // Clear input field
      chatInput.value = "";

      // Scroll to the latest message
      scrollToBottom();
    } else {
      console.log("No message entered");
    }
  });

  // Ensure the chat box is scrolled to the bottom on page load
  scrollToBottom();

  // Optional: Auto-scroll when new messages are dynamically added by other sources
  const observer = new MutationObserver(scrollToBottom);
  observer.observe(chatBox, { childList: true });
});
