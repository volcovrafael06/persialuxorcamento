import React, { useState, useEffect } from 'react'
import { clienteService } from '../services/clienteService'
import './Customers.css'

function Customers() {
  const [customers, setCustomers] = useState([])
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    cpf: '',
  })
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [cpfErrorMessage, setCpfErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      const data = await clienteService.getAll()
      setCustomers(data)
    } catch (err) {
      setError('Erro ao carregar clientes: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setNewCustomer(prev => ({
      ...prev,
      [name]: ['name', 'address', 'email'].includes(name) ? value.toUpperCase() : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newCustomer.name.trim()) {
      alert('Nome do cliente é obrigatório.')
      return
    }

    try {
      if (editingCustomerId) {
        await clienteService.update(editingCustomerId, newCustomer)
      } else {
        await clienteService.create(newCustomer)
      }
      
      loadCustomers()
      handleCloseModal()
    } catch (err) {
      setError('Erro ao salvar cliente: ' + err.message)
    }
  }

  const handleEditCustomer = (customer) => {
    setNewCustomer({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      cpf: customer.cpf,
    })
    setEditingCustomerId(customer.id)
    setShowModal(true)
  }

  const handleDeleteCustomer = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        await clienteService.delete(id)
        loadCustomers()
      } catch (err) {
        setError('Erro ao excluir cliente: ' + err.message)
      }
    }
  }

  const handleCloseModal = () => {
    setNewCustomer({ name: '', phone: '', email: '', address: '', cpf: '' })
    setEditingCustomerId(null)
    setShowModal(false)
    setCpfErrorMessage('')
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toUpperCase().includes(searchTerm.toUpperCase())
  )

  if (loading) return <div>Carregando...</div>
  if (error) return <div>Erro: {error}</div>

  return (
    <div className="customers-container">
      <div className="customers-header">
        <h2>Clientes</h2>
        <div className="header-actions">
          <div className="search-container">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome..."
              className="search-input"
            />
          </div>
          <button className="add-customer-button" onClick={() => setShowModal(true)}>
            + Novo Cliente
          </button>
        </div>
      </div>

      <div className="customers-list">
        {filteredCustomers.map(customer => (
          <div key={customer.id} className="customer-card">
            <div className="customer-info">
              <h3>{customer.name}</h3>
              <p><strong>CPF:</strong> {customer.cpf}</p>
              <p><strong>Telefone:</strong> {customer.phone}</p>
              <p><strong>Email:</strong> {customer.email}</p>
              <p><strong>Endereço:</strong> {customer.address}</p>
            </div>
            <div className="customer-actions">
              <button className="edit-button" onClick={() => handleEditCustomer(customer)}>
                Editar
              </button>
              <button className="delete-button" onClick={() => handleDeleteCustomer(customer.id)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingCustomerId ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button className="close-button" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="customer-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="cpf">CPF:</label>
                  <input
                    type="text"
                    id="cpf"
                    name="cpf"
                    value={newCustomer.cpf}
                    onChange={handleInputChange}
                    maxLength="14"
                  />
                  {cpfErrorMessage && <p className="error-message">{cpfErrorMessage}</p>}
                </div>
                <div className="form-group">
                  <label htmlFor="name">Nome:</label>
                  <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    value={newCustomer.name} 
                    onChange={handleInputChange} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Telefone:</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    name="phone" 
                    value={newCustomer.phone} 
                    onChange={handleInputChange} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email:</label>
                  <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    value={newCustomer.email} 
                    onChange={handleInputChange} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="address">Endereço:</label>
                  <input 
                    type="text" 
                    id="address" 
                    name="address" 
                    value={newCustomer.address} 
                    onChange={handleInputChange} 
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="save-button">
                  {editingCustomerId ? 'Salvar Alterações' : 'Adicionar Cliente'}
                </button>
                <button type="button" className="cancel-button" onClick={handleCloseModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Customers
