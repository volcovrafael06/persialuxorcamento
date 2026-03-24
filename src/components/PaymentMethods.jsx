import React, { useState } from 'react';

function PaymentMethods({paymentMethods, setPaymentMethods}) {
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [taxes, setTaxes] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [newTax, setNewTax] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

    const handleInputChange = (e) => {
    setNewPaymentMethod(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newPaymentMethod.trim()) {
      const nextId = paymentMethods.length > 0 ? Math.max(...paymentMethods.map((pm) => pm.id)) + 1 : 1;
      const updatedPaymentMethods = [...paymentMethods, { id: nextId, name: newPaymentMethod }];
      setPaymentMethods(updatedPaymentMethods); // Update in App
      setNewPaymentMethod('');
    }
  };

  const addPaymentMethod = () => {
    // if (newPaymentMethod.trim()) { // Handled in handleSubmit
    //   setPaymentMethods([...paymentMethods, newPaymentMethod]);
    //   setNewPaymentMethod('');
    // }
  };

  const addTax = () => {
    if (newTax.trim()) {
      setTaxes([...taxes, newTax]);
      setNewTax('');
    }
  };

  const addDiscount = () => {
    if (newDiscount.trim()) {
      setDiscounts([...discounts, newDiscount]);
      setNewDiscount('');
    }
  };

  const removePaymentMethod = (index) => {
    // const newMethods = paymentMethods.filter((_, i) => i !== index); // Don't update here
    setPaymentMethods(paymentMethods.filter((_, i) => i !== index)); // Update in App
  };

  const removeTax = (index) => {
    const newTaxes = taxes.filter((_, i) => i !== index);
    setTaxes(newTaxes);
  };

  const removeDiscount = (index) => {
    const newDiscounts = discounts.filter((_, i) => i !== index);
    setDiscounts(newDiscounts);
  };

  return (
    <div>
      <h2>Formas de Pagamento</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            value={newPaymentMethod}
            onChange={handleInputChange}
            placeholder="Nova Forma de Pagamento"
          />
          <button type='submit'>Adicionar</button>
        </div>
      </form>
      <ul>
        {paymentMethods.map((method, index) => (
          <li key={index}>
            {method.name} <button onClick={() => removePaymentMethod(index)}>Remover</button>
          </li>
        ))}
      </ul>

      <h2>Taxas</h2>
      <div className="form-group">
        <input
          type="text"
          value={newTax}
          onChange={(e) => setNewTax(e.target.value)}
          placeholder="Nova Taxa"
        />
        <button onClick={addTax}>Adicionar</button>
      </div>
      <ul>
        {taxes.map((tax, index) => (
          <li key={index}>
            {tax} <button onClick={() => removeTax(index)}>Remover</button>
          </li>
        ))}
      </ul>

      <h2>Descontos</h2>
      <div className="form-group">
        <input
          type="text"
          value={newDiscount}
          onChange={(e) => setNewDiscount(e.target.value)}
          placeholder="Novo Desconto"
        />
        <button onClick={addDiscount}>Adicionar</button>
      </div>
      <ul>
        {discounts.map((discount, index) => (
          <li key={index}>
            {discount} <button onClick={() => removeDiscount(index)}>Remover</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PaymentMethods;
