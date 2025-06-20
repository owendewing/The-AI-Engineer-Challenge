'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidApiKey, setIsValidApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const validateApiKey = (key: string) => {
    // Accept both personal API keys (sk-) and project keys (sk-proj-)
    return (key.startsWith('sk-') || key.startsWith('sk-proj-')) && key.length >= 40;
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    setIsValidApiKey(validateApiKey(newKey));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !isValidApiKey) return;

    const newMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('Attempting to connect to backend...');
      // First check if the backend is accessible using relative URL
      const healthCheck = await fetch('/api/health', {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      console.log('Health check response:', healthCheck.status);
      if (!healthCheck.ok) {
        throw new Error('Backend server is not responding');
      }

      console.log('Sending chat request...');
      const response = await fetch('/api/chat', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          developer_message: 'You are a helpful AI assistant.',
          user_message: inputMessage,
          api_key: apiKey,
        }),
      });

      console.log('Chat response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Response not OK:', response.status, errorData);
        throw new Error(errorData.detail || `Server responded with status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantMessage = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        assistantMessage += text;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = assistantMessage;
            return newMessages;
          } else {
            return [...newMessages, { role: 'assistant', content: assistantMessage }];
          }
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process your request'}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8 text-center">Owen's Chatbot</h1>
        
        <div className="mb-8 p-6 bg-white rounded-xl shadow-lg border border-forest-green/10">
          <label htmlFor="apiKey" className="block text-forest-green text-lg font-semibold mb-2">Enter your OpenAI API Key:</label>
          <input
            type="password"
            id="apiKey"
            value={apiKey}
            onChange={handleApiKeyChange}
            className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 ${
              apiKey && !isValidApiKey 
                ? 'border-red-500 focus:ring-red-500' 
                : 'border-forest-green/20 focus:ring-forest-green'
            }`}
            placeholder="sk-... or sk-proj-..."
          />
          {apiKey && !isValidApiKey && (
            <p className="text-red-500 text-sm mt-2">Please enter a valid OpenAI API key (should start with sk- or sk-proj-)</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 h-[70vh] overflow-y-auto border border-forest-green/10">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-4 rounded-xl ${
                message.role === 'user'
                  ? 'bg-forest-green text-cream ml-auto'
                  : 'bg-cream/50 text-forest-green border border-forest-green/10'
              } max-w-[85%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'} shadow-sm`}
            >
              {message.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-4 border-2 border-forest-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-green text-lg"
            disabled={!isValidApiKey || isLoading}
          />
          <button
            type="submit"
            disabled={!isValidApiKey || isLoading || !inputMessage.trim()}
            className="bg-cream text-forest-green p-4 rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
          >
            <PaperAirplaneIcon className="h-6 w-6" />
          </button>
        </form>
      </div>
    </main>
  );
}