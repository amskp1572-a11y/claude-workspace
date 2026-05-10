"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { saveMessage, pinMessage, getPinnedMessages, createBranch, generateShareToken, getConversationByToken, saveMemory, getMemories } from "@/lib/db";
import { supabase } from "@/lib/supabase";

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  is_pinned?: boolean;
  is_snippet?: boolean;
  snippet_text?: string;
  sender_name?: string;
  source_message_id?: string;
};

type Conversation = {
  id: string;
  title: string;
  branchedFromMessageId?: string;
};

type SelectionPopup = {
  x: number;
  y: number;
  text: string;
  messageId: string;
} | null;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationIndex, setActiveConversationIndex] = useState(0);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameSet, setUsernameSet] = useState(false);
  const [memories, setMemories] = useState<string[]>([]);
  const [memoryInput, setMemoryInput] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    async function init() {
      try {
        if (token) {
          const conv = await getConversationByToken(token);
          setConversationId(conv.id);
          setConversations([{ id: conv.id, title: conv.title }]);

          const { data } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

          setMessages(data || []);
          const mems = await getMemories(conv.id);
          setMemories(mems.map((m: { content: string }) => m.content));
        } else {
          const { data, error } = await supabase
            .from("conversations")
            .insert({ title: "Main Conversation" })
            .select()
            .single();
          if (error) throw error;
          setConversationId(data.id);
          setConversations([{ id: data.id, title: "Main Conversation" }]);
          const mems = await getMemories(data.id);
          setMemories(mems.map((m: { content: string }) => m.content));
        }
      } catch (e) {
        console.error("Error:", e);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleClickOutside() {
      setSelectionPopup(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function scrollToMessage(messageId: string) {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  }

  async function handleNewConversation() {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title: "New Conversation" })
      .select()
      .single();
    if (error || !data) return;
    const newConv = { id: data.id, title: "New Conversation" };
    setConversations(prev => [...prev, newConv]);
    setActiveConversationIndex(conversations.length);
    setConversationId(data.id);
    setMessages([]);
    setPinnedMessages([]);
    setMemories([]);
    setShareUrl(null);
  }

  async function sendMessage() {
    if (!input.trim() || !conversationId) return;

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    const savedUser = await saveMessage(conversationId, "user", input, username);
    userMessage.id = savedUser.id;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        memories: memories,
      }),
    });

    const data = await response.json();
    const assistantMessage: Message = { role: "assistant", content: data.message };
    const savedAssistant = await saveMessage(conversationId, "assistant", data.message, "Claude");
    assistantMessage.id = savedAssistant.id;

    setMessages([...updatedMessages, assistantMessage]);
    setLoading(false);
  }

  async function handlePin(message: Message) {
    if (!message.id || !conversationId) return;
    const newPinned = !message.is_pinned;
    await pinMessage(message.id, newPinned);
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_pinned: newPinned } : m));
    const pins = await getPinnedMessages(conversationId);
    setPinnedMessages(pins);
  }

  function handleTextSelection(messageId: string) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || text.length < 5) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectionPopup({
      x: rect.left + rect.width / 2,
      y: rect.top - 10 + window.scrollY,
      text,
      messageId,
    });
  }

  async function pinSelection() {
    if (!selectionPopup || !conversationId) return;

    const { error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: selectionPopup.text,
        is_pinned: true,
        is_snippet: true,
        snippet_text: selectionPopup.text,
        source_message_id: selectionPopup.messageId,
      });

    if (error) { console.error(error); return; }

    setSelectionPopup(null);
    const pins = await getPinnedMessages(conversationId);
    setPinnedMessages(pins);
  }

  async function handleBranch(message: Message, messageIndex: number) {
    if (!message.id || !conversationId) return;

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ title: `Branch ${conversations.length}` })
      .select()
      .single();

    if (error || !newConv) return;

    await createBranch(conversationId, message.id);

    const messagesToCopy = messages.slice(0, messageIndex + 1);
    for (const msg of messagesToCopy) {
      await saveMessage(newConv.id, msg.role, msg.content);
    }

    const newConversation: Conversation = {
      id: newConv.id,
      title: `Branch ${conversations.length}`,
      branchedFromMessageId: message.id,
    };

    setConversations(prev => [...prev, newConversation]);
    setActiveConversationIndex(conversations.length);
    setConversationId(newConv.id);
    setMessages(messagesToCopy);
    setPinnedMessages([]);
  }

  async function switchConversation(index: number) {
    const conv = conversations[index];
    setActiveConversationIndex(index);
    setConversationId(conv.id);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    setMessages(data || []);
    const pins = await getPinnedMessages(conv.id);
    setPinnedMessages(pins);
    const mems = await getMemories(conv.id);
    setMemories(mems.map((m: { content: string }) => m.content));
    setShareUrl(null);
  }

  async function handleShare() {
    if (!conversationId) return;
    const token = await generateShareToken(conversationId);
    const url = `${window.location.origin}?token=${token}`;
    setShareUrl(url);
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveMemory() {
    if (!memoryInput.trim() || !conversationId) return;
    await saveMemory(conversationId, memoryInput);
    setMemories(prev => [...prev, memoryInput]);
    setMemoryInput("");
  }

  if (!usernameSet) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl flex flex-col gap-4 w-80 shadow-2xl">
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-xl">✦</div>
            <h1 className="text-xl font-bold">Claude Workspace</h1>
            <p className="text-gray-400 text-xs text-center">A smarter way to work with AI</p>
          </div>
          <input
            className="bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-orange-500 transition-colors"
            placeholder="Enter your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && username.trim() && setUsernameSet(true)}
            autoFocus
          />
          <button
            onClick={() => username.trim() && setUsernameSet(true)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Enter Workspace →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* Selection Popup */}
      {selectionPopup && (
        <div
          className="fixed z-50 bg-yellow-400 text-black text-xs px-3 py-1 rounded-full shadow-lg cursor-pointer hover:bg-yellow-300 font-medium transition-colors"
          style={{ left: selectionPopup.x, top: selectionPopup.y, transform: "translate(-50%, -100%)" }}
          onMouseDown={(e) => { e.preventDefault(); pinSelection(); }}
        >
          ✂️ Pin Selection
        </div>
      )}

      {/* Left Sidebar */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900 h-screen">

        {/* Logo */}
        <div className="p-4 border-b border-gray-800 flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-sm">✦</div>
          <span className="font-semibold text-sm">Claude Workspace</span>
        </div>

        {/* Scrollable sidebar content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

          {/* Share Button */}
          <div>
            <button
              onClick={handleShare}
              className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
            >
              🔗 Share Conversation
            </button>
            {shareUrl && (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-xs text-gray-500 break-all">{shareUrl}</p>
                <button
                  onClick={copyShareUrl}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-lg transition-colors"
                >
                  {copied ? "✅ Copied!" : "Copy Link"}
                </button>
              </div>
            )}
          </div>

          {/* Conversations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversations</p>
              <button
                onClick={handleNewConversation}
                className="text-xs text-gray-500 hover:text-orange-400 transition-colors font-medium"
              >
                + New
              </button>
            </div>
            {conversations.map((conv, index) => (
              <button
                key={conv.id}
                onClick={() => switchConversation(index)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs mb-1 transition-colors ${
                  activeConversationIndex === index
                    ? "bg-orange-500 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                {index === 0 ? "💬" : "🌿"} {conv.title}
              </button>
            ))}
          </div>

          {/* Pinned Messages */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pinned</p>
            {pinnedMessages.length === 0 && (
              <p className="text-xs text-gray-600">Pin messages to save them here.</p>
            )}
            {pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => {
                  if (msg.is_snippet && msg.source_message_id) {
                    scrollToMessage(msg.source_message_id);
                  } else if (msg.id) {
                    scrollToMessage(msg.id);
                  }
                }}
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 text-xs text-gray-300 line-clamp-2 mb-1 cursor-pointer transition-colors border border-transparent hover:border-gray-600"
              >
                {msg.is_snippet ? "✂️ " : "📌 "}{msg.is_snippet ? msg.snippet_text : msg.content}
              </div>
            ))}
          </div>

          {/* Memory */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Memory</p>
            {memories.length === 0 && (
              <p className="text-xs text-gray-600 mb-2">Save facts for Claude to remember.</p>
            )}
            {memories.map((mem, index) => (
              <div key={index} className="bg-gray-800 rounded-lg p-2 text-xs text-gray-300 mb-1">
                🧠 {mem}
              </div>
            ))}
            <input
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-orange-500 transition-colors mt-1"
              placeholder="Add a memory..."
              value={memoryInput}
              onChange={(e) => setMemoryInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveMemory()}
            />
          </div>

        </div>

        {/* User Badge */}
        <div className="p-4 border-t border-gray-800 flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-gray-300">{username}</span>
        </div>

      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900 shrink-0">
          <span className="text-sm font-medium">
            {conversations[activeConversationIndex]?.title || "Conversation"}
          </span>
          <span className="text-xs text-gray-500">powered by Claude</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-2xl">✦</div>
              <p className="text-gray-400 text-sm">Send a message to start chatting with Claude.</p>
            </div>
          )}
          {messages.filter(msg => !msg.is_snippet).map((msg, index) => (
            <div
              key={index}
              id={`message-${msg.id}`}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} group transition-all duration-500 ${
                highlightedMessageId === msg.id ? "scale-[1.01]" : ""
              }`}
            >
              <div className="flex items-start gap-2 max-w-2xl w-full">
                {msg.role === "assistant" && (
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-6 shrink-0">
                    <button
                      onClick={() => handlePin(msg)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors ${msg.is_pinned ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                    >
                      {msg.is_pinned ? "📌" : "Pin"}
                    </button>
                    <button
                      onClick={() => handleBranch(msg, index)}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-green-800 hover:text-green-300 transition-colors"
                    >
                      Branch
                    </button>
                  </div>
                )}
                <div className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end ml-auto" : "items-start"}`}>
                  <span className="text-xs text-gray-500 px-2">
                    {msg.sender_name || (msg.role === "user" ? username : "Claude")}
                  </span>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all duration-500 ${
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-tr-sm"
                        : "bg-gray-800 text-gray-100 rounded-tl-sm"
                    } ${highlightedMessageId === msg.id ? "ring-2 ring-yellow-400" : ""}`}
                    onMouseUp={() => {
                      setTimeout(() => {
                        if (msg.id) handleTextSelection(msg.id);
                      }, 10);
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                          h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                          code: ({ children }) => <code className="bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="bg-gray-700 p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-6 shrink-0">
                    <button
                      onClick={() => handlePin(msg)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors ${msg.is_pinned ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                    >
                      {msg.is_pinned ? "📌" : "Pin"}
                    </button>
                    <button
                      onClick={() => handleBranch(msg, index)}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-green-800 hover:text-green-300 transition-colors"
                    >
                      Branch
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl rounded-tl-sm text-sm">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 shrink-0">
          <div className="flex gap-2 items-end">
            <input
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 transition-colors"
              placeholder="Message Claude..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}