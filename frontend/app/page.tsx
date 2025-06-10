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
      // First check if the backend is accessible
      const healthCheck = await fetch('http://127.0.0.1:8000/api/health', {
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
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
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
    <main className="min-h-screen bg-cream p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-forest-green mb-8 text-center">AI Chat Interface</h1>
        
        <div className="mb-8 p-4 bg-white rounded-lg shadow-md">
          <label htmlFor="apiKey" className="block text-forest-green mb-2">Enter your OpenAI API Key:</label>
          <input
            type="password"
            id="apiKey"
            value={apiKey}
            onChange={handleApiKeyChange}
            className={`w-full p-2 border rounded focus:outline-none focus:ring-2 ${
              apiKey && !isValidApiKey 
                ? 'border-red-500 focus:ring-red-500' 
                : 'border-gray-300 focus:ring-forest-green'
            }`}
            placeholder="sk-..."
          />
          {apiKey && !isValidApiKey && (
            <p className="text-red-500 text-sm mt-1">Please enter a valid OpenAI API key (should start with sk-, not sk-proj-)</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 mb-4 h-[60vh] overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-forest-green text-cream ml-auto'
                  : 'bg-gray-100 text-forest-green'
              } max-w-[80%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
            >
              {message.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-forest-green"
            disabled={!isValidApiKey || isLoading}
          />
          <button
            type="submit"
            disabled={!isValidApiKey || isLoading || !inputMessage.trim()}
            className="bg-forest-green text-cream p-2 rounded hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="h-6 w-6" />
          </button>
        </form>
      </div>
    </main>
  );
}