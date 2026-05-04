import { useState } from 'react';
import { Plus, Trash2, Star, Phone, User } from 'lucide-react';
import type { Contact } from '../types';

interface Props {
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
}

export function ContactList({ contacts, onContactsChange }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phone: '',
    relationship: '',
  });

  const handleAddContact = () => {
    if (!newContact.name || !newContact.phone) {
      alert('Please fill in all required fields');
      return;
    }

    const contact: Contact = {
      id: `contact_${Date.now()}`,
      name: newContact.name,
      phone: newContact.phone,
      relationship: newContact.relationship || 'Other',
      isPrimary: contacts.length === 0, // First contact is primary by default
    };

    onContactsChange([...contacts, contact]);
    setNewContact({ name: '', phone: '', relationship: '' });
    setShowAddForm(false);
  };

  const handleDeleteContact = (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      onContactsChange(contacts.filter(c => c.id !== id));
    }
  };

  const handleTogglePrimary = (id: string) => {
    onContactsChange(
      contacts.map(c => ({
        ...c,
        isPrimary: c.id === id ? !c.isPrimary : c.isPrimary,
      }))
    );
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2>Emergency Contacts</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Contact
        </button>
      </div>

      {showAddForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h3 className="mb-4">Add New Contact</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="+63 XXX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Relationship</label>
              <select
                value={newContact.relationship}
                onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="">Select relationship</option>
                <option value="Family">Family</option>
                <option value="Friend">Friend</option>
                <option value="Colleague">Colleague</option>
                <option value="Neighbor">Neighbor</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No emergency contacts added yet</p>
          <p className="text-gray-400">Add contacts to receive emergency alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3>{contact.name}</h3>
                    {contact.isPrimary && (
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Phone className="w-4 h-4" />
                    <span>{contact.phone}</span>
                  </div>
                  
                  <p className="text-gray-500">{contact.relationship}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleTogglePrimary(contact.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      contact.isPrimary
                        ? 'bg-yellow-100 text-yellow-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={contact.isPrimary ? 'Remove from primary contacts' : 'Set as primary contact'}
                  >
                    <Star className={`w-5 h-5 ${contact.isPrimary ? 'fill-yellow-500' : ''}`} />
                  </button>
                  
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-blue-800">
              <Star className="w-4 h-4 inline text-yellow-500 fill-yellow-500 mr-1" />
              Primary contacts will receive emergency alerts
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
