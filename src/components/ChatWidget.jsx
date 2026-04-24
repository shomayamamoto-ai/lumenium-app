import { useState, useRef, useEffect } from 'react'
import { replyTo } from '../lib/chatbot'

const INITIAL_MESSAGE = {
  type: 'bot',
  text: 'こんにちは！Lumeniumです 💡\n\nぼんやりした悩みに、光を当てる会社。\n企画から運用まで一括で解決します！\n\n下のボタンから知りたい情報を選んでください👇',
}

const QUICK_REPLIES = [
  { label: 'サービス一覧', text: 'サービス一覧' },
  { label: '料金プラン', text: '料金' },
  { label: 'AI導入・研修', text: 'AI導入' },
  { label: '動画制作', text: '動画制作' },
  { label: 'Web制作', text: 'Web制作' },
  { label: 'SNS・LINE構築', text: 'SNS運用' },
  { label: 'ご依頼の流れ', text: '依頼方法' },
  { label: '無料相談する', text: 'お問い合わせ' },
]

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    if (!text.trim()) return

    setMessages((prev) => [...prev, { type: 'user', text }])
    setInput('')
    setIsLoading(true)

    const response = replyTo(text)
    // Small delay so the typing indicator is perceptible
    await new Promise((r) => setTimeout(r, 450))
    setMessages((prev) => [...prev, { type: 'bot', text: response }])
    setIsLoading(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <>
      {/* Floating Button */}
      <button
        className="chat-widget-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'チャットを閉じる' : 'チャットを開く'}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="chat-widget-panel">
          <div className="chat-widget-header">
            <div className="chat-widget-header-info">
              <div className="chat-widget-avatar">L</div>
              <div>
                <div className="chat-widget-name">Lumenium</div>
                <div className="chat-widget-status">オンライン</div>
              </div>
            </div>
            <button className="chat-widget-close" onClick={() => setIsOpen(false)} aria-label="チャットを閉じる" type="button">✕</button>
          </div>

          <div className="chat-widget-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.type}`}>
                <div className={`chat-bubble chat-bubble-${msg.type}`}>
                  {msg.text.split('\n').map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < msg.text.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-msg chat-msg-bot">
                <div className="chat-bubble chat-bubble-bot chat-typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies */}
          <div className="chat-quick-replies">
            {QUICK_REPLIES.map((qr, i) => (
              <button
                key={i}
                className="chat-quick-btn"
                onClick={() => sendMessage(qr.text)}
                disabled={isLoading}
              >
                {qr.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <form className="chat-widget-input" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="メッセージを入力..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              送信
            </button>
          </form>
        </div>
      )}
    </>
  )
}
