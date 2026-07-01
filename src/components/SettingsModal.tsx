import React, { useState, useEffect } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [serverChanKey, setServerChanKey] = useState('')

  useEffect(() => {
    if (isOpen) {
      try {
        setDeepSeekKey(JSON.parse(localStorage.getItem('fs_key_deepseek') || '""') || '')
        setServerChanKey(JSON.parse(localStorage.getItem('fs_key_serverchan') || '""') || '')
      } catch { /* ignore */ }
    }
  }, [isOpen])

  const handleSave = () => {
    localStorage.setItem('fs_key_deepseek', JSON.stringify(deepSeekKey.trim()))
    localStorage.setItem('fs_key_serverchan', JSON.stringify(serverChanKey.trim()))
    onClose()
    alert('设置保存成功！')
  }

  if (!isOpen) return null

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 8, 20, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: '500px',
    width: '100%',
    background: 'var(--surface, #0d1117)',
    border: '1px solid var(--border, rgba(0, 248, 255, 0.15))',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 248, 255, 0.05)',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--cyan, #00f8ff)',
    marginBottom: '8px',
    letterSpacing: '0.5px',
  }

  const subtitleStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-dim, rgba(255, 255, 255, 0.45))',
    marginBottom: '28px',
    lineHeight: 1.5,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
    marginBottom: '8px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--border, rgba(0, 248, 255, 0.15))',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    boxSizing: 'border-box' as const,
  }

  const inputFocusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--cyan, #00f8ff)'
    e.target.style.boxShadow = '0 0 0 3px rgba(0, 248, 255, 0.1)'
  }

  const inputBlurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--border, rgba(0, 248, 255, 0.15))'
    e.target.style.boxShadow = 'none'
  }

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '20px',
  }

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '28px',
  }

  const cancelButtonStyle: React.CSSProperties = {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid var(--text-dim, rgba(255, 255, 255, 0.25))',
    borderRadius: '8px',
    color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }

  const saveButtonStyle: React.CSSProperties = {
    padding: '10px 24px',
    background: 'var(--cyan, #00f8ff)',
    border: 'none',
    borderRadius: '8px',
    color: '#000',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  }

  const dividerStyle: React.CSSProperties = {
    height: '1px',
    background: 'var(--border, rgba(0, 248, 255, 0.1))',
    margin: '0 0 24px 0',
    border: 'none',
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>⚙ 系统配置与密钥管理</div>
        <div style={subtitleStyle}>
          配置 API 密钥以启用 AI 研判与消息推送功能。密钥将安全存储在本地浏览器中。
        </div>
        <hr style={dividerStyle} />

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>DeepSeek API Key (用于信号研判评估)</label>
          <input
            type="password"
            value={deepSeekKey}
            onChange={(e) => setDeepSeekKey(e.target.value)}
            placeholder="sk-..."
            style={inputStyle}
            onFocus={inputFocusHandler}
            onBlur={inputBlurHandler}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>ServerChan Push Key (微信推送密钥)</label>
          <input
            type="password"
            value={serverChanKey}
            onChange={(e) => setServerChanKey(e.target.value)}
            placeholder="SCT..."
            style={inputStyle}
            onFocus={inputFocusHandler}
            onBlur={inputBlurHandler}
          />
        </div>

        <div style={buttonRowStyle}>
          <button
            style={cancelButtonStyle}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.45)'
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--text-dim, rgba(255, 255, 255, 0.25))'
              e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))'
            }}
          >
            取消
          </button>
          <button
            style={saveButtonStyle}
            onClick={handleSave}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#33f9ff'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 248, 255, 0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--cyan, #00f8ff)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}
