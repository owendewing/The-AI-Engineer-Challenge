'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, DocumentArrowUpIcon } from '@heroicons/react/24/solid';
import MarkdownRenderer from './components/MarkdownRenderer';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidApiKey, setIsValidApiKey] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStatus, setPdfStatus] = useState<{ pdf_loaded: boolean; chunks_count: number }>({ pdf_loaded: false, chunks_count: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [chatMode, setChatMode] = useState<'regular' | 'rag'>('regular');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Check PDF status on component mount
  useEffect(() => {
    checkPdfStatus();
  }, []);

  const checkPdfStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/pdf-status');
      if (response.ok) {
        const status = await response.json();
        setPdfStatus(status);
        if (status.pdf_loaded) {
          setChatMode('rag');
        }
      }
    } catch (error) {
      console.log('No PDF loaded yet');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else if (file) {
      alert('Please select a PDF file');
    }
  };

  const handleFileUpload = async () => {
    if (!pdfFile || !isValidApiKey) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('api_key', apiKey);

      const response = await fetch('http://localhost:8000/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('PDF uploaded successfully:', result);
        setChatMode('rag');
        await checkPdfStatus();
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `PDF "${pdfFile.name}" uploaded and processed successfully! You can now ask questions about the document.` 
        }]);
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to upload PDF');
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error uploading PDF: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }]);
    } finally {
      setIsUploading(false);
      setPdfFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !isValidApiKey) return;

    const newMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('Attempting to connect to backend...');
      
      let response;
      if (chatMode === 'rag') {
        // Use RAG chat endpoint
        console.log('Using RAG chat...');
        response = await fetch('http://localhost:8000/api/rag-chat', {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            user_message: inputMessage,
            api_key: apiKey,
          }),
        });
      } else {
        // Use regular chat endpoint
        console.log('Using regular chat...');
        response = await fetch('http://localhost:8000/api/chat', {
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
      }

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

  const clearChat = () => {
    setMessages([]);
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

        {/* PDF Upload Section */}
        <div className="mb-8 p-6 bg-white rounded-xl shadow-lg border border-forest-green/10">
          <h2 className="text-forest-green text-lg font-semibold mb-4">Upload PDF Document</h2>
          <div className="flex gap-4 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="flex-1 p-2 border-2 border-forest-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-green"
            />
            <button
              onClick={handleFileUpload}
              disabled={!pdfFile || !isValidApiKey || isUploading}
              className="bg-forest-green text-cream px-6 py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
            >
              <DocumentArrowUpIcon className="h-5 w-5" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {pdfStatus.pdf_loaded && (
            <p className="text-green-600 text-sm mt-2">
              ✓ PDF loaded with {pdfStatus.chunks_count} text chunks
            </p>
          )}
        </div>

        {/* Chat Mode Toggle */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setChatMode('regular')}
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              chatMode === 'regular'
                ? 'bg-forest-green text-cream'
                : 'bg-cream text-forest-green border border-forest-green/20'
            }`}
          >
            Regular Chat
          </button>
          <button
            onClick={() => setChatMode('rag')}
            disabled={!pdfStatus.pdf_loaded}
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              chatMode === 'rag'
                ? 'bg-forest-green text-cream'
                : 'bg-cream text-forest-green border border-forest-green/20'
            } ${!pdfStatus.pdf_loaded ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Chat with PDF
          </button>
          <button
            onClick={clearChat}
            className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all duration-200"
          >
            Clear Chat
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 h-[70vh] overflow-y-auto border border-forest-green/10">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              {chatMode === 'rag' && pdfStatus.pdf_loaded 
                ? 'Ask questions about your uploaded PDF document!'
                : 'Start a conversation or upload a PDF to chat with it!'}
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-4 rounded-xl ${
                message.role === 'user'
                  ? 'bg-forest-green text-cream ml-auto'
                  : 'bg-cream/50 text-forest-green border border-forest-green/10'
              } max-w-[85%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'} shadow-sm`}
            >
              {message.role === 'user' ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={chatMode === 'rag' ? "Ask about your PDF..." : "Type your message..."}
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