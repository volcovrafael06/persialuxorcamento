import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { clienteService } from '../services/clienteService';
import './VisitScheduler.css';

function VisitScheduler() {
  const [visits, setVisits] = useState([]);
  const [newVisit, setNewVisit] = useState({
    customer_name: '',
    phone: '',
    cep: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    date_time: '',
    notes: '',
  });
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchVisits();
  }, []);

  const fetchVisits = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('visits')
        .select('*')
        .order('date_time', { ascending: true });

      if (error) {
        console.error('Error fetching visits:', error);
        throw error;
      }
      
      console.log('Fetched visits:', data); // Debug log
      setVisits(data || []);
    } catch (error) {
      console.error('Error in fetchVisits:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setNewVisit({ ...newVisit, [e.target.name]: e.target.value });
  };

  const handleCepChange = (e) => {
    const cep = e.target.value.replace(/\D/g, '');
    setNewVisit({ ...newVisit, cep });

    if (cep.length === 8) {
      fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then(response => response.json())
        .then(data => {
          if (data.erro) {
            alert('CEP não encontrado.');
          } else {
            setNewVisit(prevVisit => ({
              ...prevVisit,
              address: data.logradouro,
              city: data.localidade,
              state: data.uf,
              neighborhood: data.bairro,
            }));
          }
        })
        .catch(error => {
          console.error('Erro ao consultar CEP:', error);
          alert('Erro ao consultar CEP.');
        });
    } else if (cep.length !== 8 && newVisit.address !== '') {
      setNewVisit(prevVisit => ({
        ...prevVisit,
        address: '',
        city: '',
        state: '',
        neighborhood: '',
      }));
    }
  };

  // Função para verificar se o cliente já existe pelo nome
  const checkCustomerExists = async (customerName) => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .ilike('name', customerName)
        .limit(1);
      
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Erro ao verificar cliente:', error);
      return null;
    }
  };

  // Função para criar um novo cliente
  const createCustomer = async (visitData) => {
    try {
      // Formatar o endereço completo
      const fullAddress = `${visitData.address}, ${visitData.number}${visitData.complement ? `, ${visitData.complement}` : ''} - ${visitData.neighborhood}, ${visitData.city}/${visitData.state}, CEP: ${visitData.cep}`;
      
      const newCustomer = {
        name: visitData.customer_name.toUpperCase(),
        address: fullAddress.toUpperCase(),
        phone: visitData.phone || '',  // Usar o telefone da visita se disponível
        email: '',
        cpf: ''
      };
      
      console.log('Tentando criar cliente:', newCustomer);
      const createdCustomer = await clienteService.create(newCustomer);
      
      if (!createdCustomer) {
        throw new Error('Falha ao criar cliente: resposta vazia do servidor');
      }
      
      console.log('Cliente criado com sucesso:', createdCustomer);
      return createdCustomer;
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      throw error;
    }
  };

  const handleScheduleVisit = async (e) => {
    e.preventDefault();
    if (
      !newVisit.customer_name ||
      !newVisit.date_time ||
      !newVisit.cep ||
      !newVisit.address ||
      !newVisit.number ||
      !newVisit.city ||
      !newVisit.state
    ) {
      alert('Por favor, preencha todos os campos obrigatórios, incluindo o número do endereço.');
      return;
    }

    setLoading(true);
    setError(null);

    const visitData = {
      ...newVisit,
      date_time: new Date(newVisit.date_time).toISOString(),
      status: 'pending'
    };

    try {
      // Verificar se o cliente já existe
      const existingCustomer = await checkCustomerExists(newVisit.customer_name);
      
      if (!existingCustomer && !editingVisitId) {
        // Se o cliente não existe e estamos criando uma nova visita, criar o cliente
        try {
          const createdCustomer = await createCustomer(visitData);
          console.log('Cliente criado e retornado:', createdCustomer);
          if (!createdCustomer) {
            throw new Error('Falha ao criar cliente: nenhum dado retornado');
          }
        } catch (customerError) {
          console.error('Erro detalhado ao criar cliente:', customerError);
          throw customerError;
        }
      }

      if (editingVisitId) {
        const { data, error: updateError } = await supabase
          .from('visits')
          .update(visitData)
          .eq('id', editingVisitId)
          .select();

        if (updateError) throw updateError;
        
        setVisits(prevVisits => 
          prevVisits.map(visit => 
            visit.id === editingVisitId ? data[0] : visit
          )
        );
        
        alert(`Visita de ${newVisit.customer_name} reagendada com sucesso!`);
      } else {
        const { data, error: insertError } = await supabase
          .from('visits')
          .insert([visitData])
          .select();

        if (insertError) throw insertError;
        
        setVisits(prevVisits => [...prevVisits, data[0]]);
        alert(`Visita para ${newVisit.customer_name} agendada com sucesso!${!existingCustomer ? ' Cliente cadastrado automaticamente.' : ''}`);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error saving visit:', error);
      setError(error.message);
      alert('Erro ao salvar a visita: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditVisit = (visitId) => {
    const visitToEdit = visits.find((visit) => visit.id === visitId);
    if (visitToEdit) {
      setNewVisit({
        customer_name: visitToEdit.customer_name,
        phone: visitToEdit.phone || '',
        cep: visitToEdit.cep,
        address: visitToEdit.address,
        number: visitToEdit.number,
        complement: visitToEdit.complement,
        neighborhood: visitToEdit.neighborhood,
        city: visitToEdit.city,
        state: visitToEdit.state,
        date_time: new Date(visitToEdit.date_time).toISOString().slice(0, 16),
        notes: visitToEdit.notes,
      });
      setEditingVisitId(visitId);
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    setNewVisit({
      customer_name: '',
      phone: '',
      cep: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      date_time: '',
      notes: '',
    });
    setEditingVisitId(null);
    setShowModal(false);
  };

  const handleConfirmVisit = async (visitId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('visits')
        .update({ status: 'confirmed' })
        .eq('id', visitId)
        .select();

      if (error) throw error;

      setVisits(prevVisits => 
        prevVisits.map(visit => 
          visit.id === visitId ? data[0] : visit
        )
      );
      
      const visit = visits.find(v => v.id === visitId);
      alert(`Visita de ${visit.customer_name} confirmada com sucesso!`);
    } catch (err) {
      console.error("Error confirming visit:", err);
      setError(err.message);
      alert('Erro ao confirmar a visita: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelVisit = async (visitId) => {
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) {
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('visits')
        .update({ status: 'cancelled' })
        .eq('id', visitId)
        .select();

      if (error) throw error;

      setVisits(prevVisits => 
        prevVisits.map(visit => 
          visit.id === visitId ? data[0] : visit
        )
      );
      
      const visit = visits.find(v => v.id === visitId);
      alert(`Visita de ${visit.customer_name} cancelada com sucesso!`);
    } catch (err) {
      console.error("Error cancelling visit:", err);
      setError(err.message);
      alert('Erro ao cancelar a visita: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVisit = async (visitId) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('visits')
        .delete()
        .eq('id', visitId);

      if (error) throw error;

      setVisits(prevVisits => prevVisits.filter(visit => visit.id !== visitId));
      alert('Agendamento excluído com sucesso!');
    } catch (err) {
      console.error("Error deleting visit:", err);
      setError(err.message);
      alert('Erro ao excluir o agendamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getVisitStatusClass = (visit) => {
    if (visit.status === 'confirmed') return 'confirmed';
    if (visit.status === 'cancelled') return 'cancelled';
    if (new Date(visit.date_time) < new Date()) return 'past';
    return 'pending';
  };

  const getVisitStatusText = (visit) => {
    if (visit.status === 'confirmed') return 'Confirmada';
    if (visit.status === 'cancelled') return 'Cancelada';
    if (new Date(visit.date_time) < new Date()) return 'Passada';
    return 'Pendente';
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return `${date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })} às ${date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  const formatAddress = (visit) => {
    return `${visit.address}, ${visit.number} - ${visit.neighborhood}, ${visit.city}/${visit.state}`;
  };

  const isVisitPast = (visit) => {
    return new Date(visit.date_time) < new Date();
  };

  if (loading && !showModal) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error}</p>;

  return (
    <div className="visit-scheduler">
      <div className="page-header">
        <h2 className="page-title">Agendamento de Visitas</h2>
      </div>

      <div className="visit-list-header">
        <h3>Visitas Agendadas</h3>
        <div className="visit-filter-buttons">
          <button 
            className={`filter-button ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todas
          </button>
          <button 
            className={`filter-button ${filter === 'confirmed' ? 'active' : ''}`}
            onClick={() => setFilter('confirmed')}
          >
            Confirmadas
          </button>
          <button 
            className={`filter-button ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pendentes
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <i className="fas fa-plus"></i> Agendar Nova Visita
        </button>
      </div>

      <div className="visit-list">
        {loading ? (
          <div className="loading">Carregando visitas...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : visits.length === 0 ? (
          <div className="no-visits">Nenhuma visita agendada</div>
        ) : (
          visits
            .filter(visit => {
              if (filter === 'confirmed') return visit.status === 'confirmed';
              if (filter === 'pending') return visit.status !== 'confirmed';
              return true; // 'all' filter
            })
            .map((visit) => (
            <div key={visit.id} className={`visit-card ${getVisitStatusClass(visit)}`}>
              <div className="visit-header">
                <h4>{visit.customer_name}</h4>
                <span className={`status-badge ${getVisitStatusClass(visit)}`}>
                  {getVisitStatusText(visit)}
                </span>
              </div>
              
              <div className="visit-details">
                <p className="visit-datetime">
                  <i className="fas fa-calendar"></i>
                  {formatDateTime(visit.date_time)}
                </p>
                <p className="visit-address">
                  <i className="fas fa-map-marker-alt"></i>
                  {formatAddress(visit)}
                </p>
                {visit.notes && (
                  <p className="visit-notes">
                    <i className="fas fa-sticky-note"></i>
                    {visit.notes}
                  </p>
                )}
              </div>

              <div className="visit-actions">
                <button
                  className="btn btn-edit"
                  onClick={() => handleEditVisit(visit.id)}
                >
                  <i className="fas fa-edit"></i>
                  Editar
                </button>
                {!isVisitPast(visit) && visit.status !== 'confirmed' && visit.status !== 'cancelled' && (
                  <button
                    className="btn btn-confirm"
                    onClick={() => handleConfirmVisit(visit.id)}
                  >
                    <i className="fas fa-check"></i>
                    Confirmar
                  </button>
                )}
                {!isVisitPast(visit) && visit.status !== 'cancelled' && (
                  <button
                    className="btn btn-cancel"
                    onClick={() => handleCancelVisit(visit.id)}
                  >
                    <i className="fas fa-times"></i>
                    Cancelar
                  </button>
                )}
                <button
                  className="btn btn-delete"
                  onClick={() => handleDeleteVisit(visit.id)}
                >
                  <i className="fas fa-trash"></i>
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingVisitId ? 'Editar Agendamento' : 'Agendar Nova Visita'}</h3>
              <button className="close-button" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleScheduleVisit} className="visit-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="customer_name">Cliente:</label>
                  <input
                    type="text"
                    id="customer_name"
                    name="customer_name"
                    value={newVisit.customer_name}
                    onChange={handleInputChange}
                    placeholder="Nome do Cliente"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Telefone:</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={newVisit.phone}
                    onChange={handleInputChange}
                    placeholder="Telefone do Cliente"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="date_time">Data e Hora:</label>
                  <input
                    type="datetime-local"
                    id="date_time"
                    name="date_time"
                    value={newVisit.date_time}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cep">CEP:</label>
                  <input
                    type="text"
                    id="cep"
                    name="cep"
                    value={newVisit.cep}
                    onChange={handleCepChange}
                    placeholder="CEP"
                    maxLength="9"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="address">Rua:</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={newVisit.address}
                    onChange={handleInputChange}
                    placeholder="Rua"
                    required
                    readOnly
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="number">Número:</label>
                  <input
                    type="text"
                    id="number"
                    name="number"
                    value={newVisit.number}
                    onChange={handleInputChange}
                    placeholder="Número"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="complement">Complemento:</label>
                  <input
                    type="text"
                    id="complement"
                    name="complement"
                    value={newVisit.complement}
                    onChange={handleInputChange}
                    placeholder="Complemento"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="neighborhood">Bairro:</label>
                  <input
                    type="text"
                    id="neighborhood"
                    name="neighborhood"
                    value={newVisit.neighborhood}
                    onChange={handleInputChange}
                    placeholder="Bairro"
                    required
                    readOnly
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="city">Cidade:</label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={newVisit.city}
                    onChange={handleInputChange}
                    placeholder="Cidade"
                    required
                    readOnly
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="state">Estado:</label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    value={newVisit.state}
                    onChange={handleInputChange}
                    placeholder="Estado"
                    required
                    readOnly
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="notes">Observações:</label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={newVisit.notes}
                    onChange={handleInputChange}
                    placeholder="Observações adicionais"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="save-button" disabled={loading}>
                  {editingVisitId ? 'Salvar Alterações' : 'Agendar Visita'}
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
  );
}

export default VisitScheduler;
