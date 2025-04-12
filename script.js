document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'http://localhost:5000';
  const endpoints = {
    translate: `${API_BASE_URL}/translate`,
    tts: `${API_BASE_URL}/tts`,
    conversation: `${API_BASE_URL}/conversation`,
    pronunciation: `${API_BASE_URL}/check-pronunciation`
  };

  let currentUser = null;
  let recognition = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let currentConversationScenario = 'restaurant';
  let conversationHistory = JSON.parse(localStorage.getItem('conversationHistory')) || [];
  let isChatbotOpen = false;

  const elements = {
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileMenu: document.getElementById('mobileMenu'),
    loginBtn: document.getElementById('loginBtn'),
    signupBtn: document.getElementById('signupBtn'),
    loginModal: document.getElementById('loginModal'),
    signupModal: document.getElementById('signupModal'),
    closeLoginModal: document.getElementById('closeLoginModal'),
    closeSignupModal: document.getElementById('closeSignupModal'),
    switchToSignup: document.getElementById('switchToSignup'),
    switchToLogin: document.getElementById('switchToLogin'),
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm'),
    loginError: document.getElementById('loginError'),
    signupError: document.getElementById('signupError'),
    recordBtn: document.getElementById('recordBtn'),
    recordStatus: document.getElementById('recordStatus'),
    aiResponse: document.getElementById('aiResponse'),
    startPracticeBtn: document.getElementById('startPracticeBtn'),
    conversationContainer: document.getElementById('conversationContainer'),
    practicePlaceholder: document.getElementById('practicePlaceholder'),
    conversationHistory: document.getElementById('conversationHistory'),
    voiceInputBtn: document.getElementById('voiceInputBtn'),
    getHintBtn: document.getElementById('getHintBtn'),
    chatInput: document.getElementById('chatInput'),
    chatSubmit: document.getElementById('chatSubmit'),
    scenarioSelect: document.getElementById('scenarioSelect'),
    chatbotButton: document.getElementById('chatbotButton'),
    chatbotModal: document.getElementById('chatbotModal'),
    closeChatbot: document.getElementById('closeChatbot'),
    chatbotMessages: document.getElementById('chatbotMessages'),
    chatbotInput: document.getElementById('chatbotInput'),
    chatbotSend: document.getElementById('chatbotSend'),
    chatbotVoiceBtn: document.getElementById('chatbotVoiceBtn'),
    chatbotPlayBtn: document.getElementById('chatbotPlayBtn')
  };

  // Add sticker and emoji mapping
  const messageEmojis = {
    greeting: ['👋', '🙏', '😊'],
    question: ['🤔', '❓', '💭'],
    happy: ['😄', '😊', '🎉'],
    sad: ['😢', '😔', '💔'],
    food: ['🍽️', '🍜', '🍛'],
    shopping: ['🛍️', '💰', '🛒'],
    thank: ['🙏', '😊', '💝'],
    bye: ['👋', '😊', '✨'],
    default: ['💬', '🤖', '✨']
  };

  const messageStickers = {
    greeting: '👋',
    question: '🤔',
    happy: '😄',
    sad: '😢',
    food: '🍽️',
    shopping: '🛍️',
    thank: '🙏',
    bye: '👋',
    default: '💬'
  };

  // Function to get random emoji from array
  function getRandomEmoji(type) {
    const emojis = messageEmojis[type] || messageEmojis.default;
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  // Function to detect message type and get appropriate emoji/sticker
  function getMessageType(message) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('namaste')) {
      return 'greeting';
    } else if (lowerMessage.includes('?') || lowerMessage.includes('what') || lowerMessage.includes('how')) {
      return 'question';
    } else if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
      return 'thank';
    } else if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
      return 'bye';
    } else if (lowerMessage.includes('food') || lowerMessage.includes('eat') || lowerMessage.includes('restaurant')) {
      return 'food';
    } else if (lowerMessage.includes('shop') || lowerMessage.includes('buy') || lowerMessage.includes('price')) {
      return 'shopping';
    } else if (lowerMessage.includes('happy') || lowerMessage.includes('great') || lowerMessage.includes('wonderful')) {
      return 'happy';
    } else if (lowerMessage.includes('sad') || lowerMessage.includes('sorry') || lowerMessage.includes('unhappy')) {
      return 'sad';
    }
    return 'default';
  }

  function init() {
    setupEventListeners();
    setupVoiceRecognition();
    loadConversationHistory();
  }

  function setupEventListeners() {
    elements.mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    elements.loginBtn.addEventListener('click', () => showModal('login'));
    elements.signupBtn.addEventListener('click', () => showModal('signup'));
    elements.closeLoginModal.addEventListener('click', () => hideModal('login'));
    elements.closeSignupModal.addEventListener('click', () => hideModal('signup'));
    elements.switchToSignup.addEventListener('click', () => { hideModal('login'); showModal('signup'); });
    elements.switchToLogin.addEventListener('click', () => { hideModal('signup'); showModal('login'); });
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.signupForm.addEventListener('submit', handleSignup);
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.startPracticeBtn.addEventListener('click', startConversationPractice);
    elements.voiceInputBtn.addEventListener('click', toggleVoiceRecognition);
    elements.getHintBtn.addEventListener('click', getHint);
    elements.chatInput.addEventListener('keypress', debounce((e) => {
      if (e.key === 'Enter') handleChatSubmit();
    }, 300));
    elements.chatSubmit.addEventListener('click', handleChatSubmit);
    elements.chatbotButton.addEventListener('click', toggleChatbot);
    elements.closeChatbot.addEventListener('click', toggleChatbot);
    elements.chatbotSend.addEventListener('click', sendChatbotMessage);
    elements.chatbotInput.addEventListener('keypress', debounce((e) => {
      if (e.key === 'Enter') sendChatbotMessage();
    }, 300));
    elements.chatbotVoiceBtn.addEventListener('click', toggleChatbotVoiceRecognition);
    elements.chatbotPlayBtn.addEventListener('click', playLastHindiTranslation);
    document.querySelectorAll('a[href^="#"]').forEach(anchor => anchor.addEventListener('click', smoothScroll));
  }

  function toggleMobileMenu() {
    elements.mobileMenu.classList.toggle('hidden');
    elements.mobileMenu.setAttribute('aria-hidden', elements.mobileMenu.classList.contains('hidden'));
  }

  function showModal(modalType) {
    const modal = modalType === 'login' ? elements.loginModal : elements.signupModal;
    const error = modalType === 'login' ? elements.loginError : elements.signupError;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      modal.classList.remove('modal-hidden');
      modal.classList.add('modal-visible');
    }, 10);
    error.classList.add('hidden');
  }

  function hideModal(modalType) {
    const modal = modalType === 'login' ? elements.loginModal : elements.signupModal;
    modal.classList.remove('modal-visible');
    modal.classList.add('modal-hidden');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }, 300);
  }

  function smoothScroll(e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;
    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth' });
      if (!elements.mobileMenu.classList.contains('hidden')) toggleMobileMenu();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    showError('login', 'Login functionality is a demo. Use any email/password.');
    setTimeout(() => {
      currentUser = { email: 'demo@demo.com' };
      hideModal('login');
    }, 1000);
  }

  async function handleSignup(e) {
    e.preventDefault();
    showError('signup', 'Signup functionality is a demo. Account created!');
    setTimeout(() => {
      currentUser = { email: 'demo@demo.com' };
      hideModal('signup');
    }, 1000);
  }

  function showError(formType, message) {
    const errorEl = formType === 'login' ? elements.loginError : elements.signupError;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    errorEl.setAttribute('role', 'alert');
  }

  async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        await processRecordedAudio(audioBlob);
      };
      mediaRecorder.start();
      elements.recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
      elements.recordBtn.classList.remove('bg-indigo-100');
      elements.recordBtn.classList.add('bg-red-500', 'text-white');
      elements.recordStatus.textContent = 'Listening... Speak now';
      elements.recordBtn.setAttribute('aria-label', 'Stop recording');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      elements.recordStatus.textContent = 'Error accessing microphone';
      resetRecordingUI();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      resetRecordingUI();
    }
  }

  function resetRecordingUI() {
    elements.recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    elements.recordBtn.classList.remove('bg-red-500', 'text-white');
    elements.recordBtn.classList.add('bg-indigo-100');
    elements.recordStatus.textContent = 'Click to speak';
    elements.recordBtn.setAttribute('aria-label', 'Start recording');
  }

  async function processRecordedAudio(audioBlob) {
    elements.recordStatus.textContent = 'Processing your speech...';
    const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
    const expectedText = document.querySelector('.hindi-phrase')?.textContent || '';
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('expected_text', expectedText);

    try {
      const response = await fetch(endpoints.pronunciation, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Pronunciation check failed');
      const result = await response.json();
      const escapedText = result.expected_text.replace(/'/g, "\\'");
      elements.aiResponse.classList.remove('hidden');
      elements.aiResponse.innerHTML = result.is_correct
        ? `<div class="text-green-600 mb-2"><i class="fas fa-check-circle mr-2"></i> Great job!</div><div class="text-sm text-gray-300">You said: "${result.recognized_text}"<br>Expected: "${result.expected_text}"</div>`
        : `<div class="text-yellow-500 mb-2"><i class="fas fa-exclamation-circle mr-2"></i> Almost there!</div><div class="text-sm text-gray-300">You said: "${result.recognized_text}"<br>Expected: "${result.expected_text}"</div><button class="mt-2 px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 play-hindi" data-text="${escapedText}"><i class="fas fa-volume-up mr-1"></i> Hear it</button>`;
      elements.recordStatus.textContent = 'Click to speak again';
    } catch (error) {
      console.error('Error processing audio:', error);
      elements.aiResponse.innerHTML = `<div class="text-red-500"><i class="fas fa-times-circle mr-2"></i> Error processing your speech. Please try again.</div>`;
    }
  }

  async function startConversationPractice() {
    elements.practicePlaceholder.classList.add('hidden');
    elements.conversationContainer.classList.remove('hidden');
    elements.conversationHistory.innerHTML = '';
    conversationHistory = [];
    localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    const initialMessage = {
      english: "Hello! Let's practice some Hindi conversation.",
      hindi: "नमस्ते! चलो हिंदी में बातचीत का अभ्यास करते हैं।",
      transliteration: "(Namaste! Chalo Hindi mein baatcheet ka abhyas karte hain.)"
    };
    addConversationMessage('ai', formatAIMessage(initialMessage));
    elements.chatInput.focus();
  }

  function formatAIMessage(response) {
    const escapedHindi = response.hindi.replace(/'/g, "\\'");
    return `
      <div class="mb-2"><strong>English:</strong> ${response.english}</div>
      <div class="mb-2 hindi-phrase"><strong>Hindi:</strong> ${response.hindi}</div>
      <div><strong>Pronunciation:</strong> ${response.transliteration}</div>
      <button 
        class="mt-2 px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 play-hindi" 
        data-text="${escapedHindi}">
        <i class="fas fa-volume-up mr-1"></i> Play
      </button>
    `;
  }

  async function handleChatSubmit() {
    const message = elements.chatInput.value.trim();
    if (!message) return;
    addConversationMessage('user', message);
    conversationHistory.push({ sender: 'user', message });
    localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    elements.chatInput.value = '';
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'flex items-start mb-4';
    typingIndicator.innerHTML = `<div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mr-4 flex-shrink-0"><i class="fas fa-robot text-indigo-600"></i></div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    elements.conversationHistory.appendChild(typingIndicator);
    elements.conversationHistory.scrollTop = elements.conversationHistory.scrollHeight;

    try {
      const response = await fetch(endpoints.conversation, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, scenario: currentConversationScenario, history: conversationHistory })
      });
      elements.conversationHistory.removeChild(typingIndicator);
      if (response.ok) {
        const data = await response.json();
        addConversationMessage('ai', formatAIMessage(data));
        conversationHistory.push({ sender: 'ai', message: data.full_response });
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        playTextToSpeech(data.hindi, 'hi-IN');
      } else {
        throw new Error((await response.json()).error);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      elements.conversationHistory.removeChild(typingIndicator);
      addConversationMessage('ai', "Sorry, I'm having trouble responding. Please try again.");
    }
  }

  function addConversationMessage(sender, message) {
    const messageType = getMessageType(message);
    const emoji = getRandomEmoji(messageType);
    const sticker = messageStickers[messageType];

    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start mb-4 ${sender === 'user' ? 'justify-end' : ''}`;

    if (sender === 'user') {
      messageDiv.innerHTML = `
        <div class="conversation-bubble user-bubble">
          <div class="flex items-center justify-end">
            <div class="flex-grow">${message}</div>
            <span class="ml-2 text-xl">${emoji}</span>
          </div>
        </div>
        <div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center ml-4 flex-shrink-0">
          <i class="fas fa-user text-gray-600"></i>
        </div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mr-4 flex-shrink-0">
          <span class="text-xl">${sticker}</span>
        </div>
        <div class="conversation-bubble ai-bubble">
          <div class="flex items-start">
            <div class="flex-grow">${message}</div>
            <span class="ml-2 text-xl self-end">${emoji}</span>
          </div>
        </div>
      `;
    }

    elements.conversationHistory.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth' });
  }

  async function getHint() {
    const hints = [
      { english: "Try saying: 'I would like to order food'", hindi: "मुझे भोजन ऑर्डर करना है", transliteration: "(Mujhe bhojan order karna hai)" },
      { english: "Try asking: 'What do you recommend?'", hindi: "आप क्या सुझाव देंगे?", transliteration: "(Aap kya sujhaav denge?)" }
    ];
    const randomHint = hints[Math.floor(Math.random() * hints.length)];
    addConversationMessage('ai', `<strong>Hint:</strong> ${formatAIMessage(randomHint)}`);
  }

  function setupVoiceRecognition() {
    if ('webkitSpeechRecognition' in window) {
      recognition = new webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'hi-IN';
      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        elements.chatInput.value = transcript;
        await handleChatSubmit();
      };
      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        elements.voiceInputBtn.innerHTML = '<i class="fas fa-microphone mr-1"></i> Voice Input';
      };
    } else {
      elements.voiceInputBtn.disabled = true;
      elements.voiceInputBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function toggleVoiceRecognition() {
    if (recognition && recognition.running) {
      recognition.stop();
      elements.voiceInputBtn.innerHTML = '<i class="fas fa-microphone mr-1"></i> Voice Input';
    } else {
      elements.voiceInputBtn.innerHTML = '<i class="fas fa-stop mr-1"></i> Listening...';
      recognition.start();
    }
  }

  function toggleChatbot() {
    isChatbotOpen = !isChatbotOpen;
    if (isChatbotOpen) {
      elements.chatbotModal.classList.remove('hidden');
      elements.chatbotModal.setAttribute('aria-hidden', 'false');
      setTimeout(() => elements.chatbotModal.classList.add('modal-visible'), 10);
      elements.chatbotInput.focus();
      elements.chatbotButton.style.animation = 'none';
    } else {
      elements.chatbotModal.classList.remove('modal-visible');
      setTimeout(() => {
        elements.chatbotModal.classList.add('hidden');
        elements.chatbotModal.setAttribute('aria-hidden', 'true');
      }, 300);
      elements.chatbotButton.style.animation = 'float 3s ease-in-out infinite';
    }
  }

  function addChatbotMessage(sender, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
    messageDiv.textContent = message;
    elements.chatbotMessages.appendChild(messageDiv);
    elements.chatbotMessages.scrollTop = elements.chatbotMessages.scrollHeight;
  }

  async function sendChatbotMessage() {
    const message = elements.chatbotInput.value.trim();
    if (!message) return;
    addChatbotMessage('user', message);
    elements.chatbotInput.value = '';
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
    elements.chatbotMessages.appendChild(typingIndicator);

    try {
      const translatedText = await translateText(message, 'hi');
      elements.chatbotMessages.removeChild(typingIndicator);
      if (translatedText) {
        addChatbotMessage('bot', translatedText);
        elements.chatbotPlayBtn.dataset.lastTranslation = translatedText;
        playTextToSpeech(translatedText, 'hi-IN');
      } else {
        addChatbotMessage('bot', "Sorry, I couldn't translate that. Please try again.");
      }
    } catch (error) {
      elements.chatbotMessages.removeChild(typingIndicator);
      addChatbotMessage('bot', "Sorry, I couldn't translate that. Please try again.");
    }
  }

  async function playLastHindiTranslation() {
    const translation = elements.chatbotPlayBtn.dataset.lastTranslation;
    if (translation) playTextToSpeech(translation, 'hi-IN');
  }

  async function translateText(text, targetLang = 'hi') {
    try {
      const response = await fetch(endpoints.translate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'same-origin',
        body: JSON.stringify({ text, target_lang: targetLang })
      });
      if (response.ok) {
        const data = await response.json();
        return data.translatedText;
      }
      return null;
    } catch (error) {
      console.error('Translation error:', error);
      return null;
    }
  }

  window.playTextToSpeech = async function (text, lang) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      speechSynthesis.speak(utterance);
      return;
    }
    try {
      const response = await fetch(endpoints.tts, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang.split('-')[0] })
      });
      if (response.ok) {
        const data = await response.json();
        const audio = new Audio(data.audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  function toggleChatbotVoiceRecognition() {
    addChatbotMessage('bot', 'Voice input not fully implemented in this demo.');
  }

  function loadConversationHistory() {
    conversationHistory.forEach(msg => {
      try {
        // Try to parse as JSON first
        const parsedMessage = JSON.parse(msg.message);
        addConversationMessage(msg.sender, msg.sender === 'user' ? msg.message : formatAIMessage(parsedMessage));
      } catch (e) {
        // If parsing fails, use the message as is
        addConversationMessage(msg.sender, msg.message);
      }
    });
  }

  // Debounce utility
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Add event delegation for play buttons
  document.addEventListener('click', function (e) {
    if (e.target.closest('.play-hindi')) {
      const button = e.target.closest('.play-hindi');
      const text = button.dataset.text;
      if (text) {
        playTextToSpeech(text, 'hi-IN');
      }
    }
  });

  init();
});