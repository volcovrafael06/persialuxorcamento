import React, { useState, useEffect } from 'react';
import { connectionService } from '../services/connectionService';

function ConnectionStatus() {
  const [connectionStatus, setConnectionStatus] = useState({
    isChecking: true,
    isAvailable: true,
    error: null,
    lastChecked: null
  });

  const checkConnection = async () => {
    setConnectionStatus(prev => ({ ...prev, isChecking: true }));
    
    try {
      const result = await connectionService.checkConnection();
      
      setConnectionStatus({
        isChecking: false,
        isAvailable: result.isAvailable,
        error: result.error,
        lastChecked: new Date()
      });
    } catch (error) {
      setConnectionStatus({
        isChecking: false,
        isAvailable: false,
        error: error.message || 'Erro desconhecido ao verificar conexão',
        lastChecked: new Date()
      });
    }
  };

  useEffect(() => {
    // Check connection when component mounts
    checkConnection();
    
    // Set up periodic connection checking
    const intervalId = setInterval(checkConnection, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, []);

  if (connectionStatus.isChecking) {
    return (
      <div className="connection-status checking">
        <span>Verificando conexão...</span>
      </div>
    );
  }

  if (!connectionStatus.isAvailable) {
    return (
      <div className="connection-status error">
        <div className="status-icon">❌</div>
        <div className="status-message">
          <strong>Serviço indisponível</strong>
          {connectionStatus.error && (
            <span className="error-details">{connectionStatus.error}</span>
          )}
          <button onClick={checkConnection} className="retry-button">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="connection-status connected">
      <div className="status-icon">✅</div>
      <div className="status-message">
        <strong>Conectado</strong>
        {connectionStatus.lastChecked && (
          <span className="status-time">
            Última verificação: {connectionStatus.lastChecked.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default ConnectionStatus;
