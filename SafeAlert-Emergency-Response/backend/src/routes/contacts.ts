import { Router } from 'express';
import { User } from '../models/index.js';

const router = Router();

// Get user contacts
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('contacts').lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      contacts: user.contacts || [],
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a contact
router.post('/:userId', async (req, res) => {
  try {
    const { name, phone, isPrimary } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      user.contacts.forEach((contact: any) => {
        contact.isPrimary = false;
      });
    }

    user.contacts.push({
      name,
      phone,
      isPrimary: isPrimary || false,
    });

    await user.save();

    res.status(201).json({
      message: 'Contact added successfully',
      contacts: user.contacts,
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a contact
router.patch('/:userId/:contactIndex', async (req, res) => {
  try {
    const { name, phone, isPrimary } = req.body;
    const contactIndex = parseInt(req.params.contactIndex);

    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (contactIndex < 0 || contactIndex >= user.contacts.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      user.contacts.forEach((contact: any) => {
        contact.isPrimary = false;
      });
    }

    if (name) user.contacts[contactIndex].name = name;
    if (phone) user.contacts[contactIndex].phone = phone;
    if (isPrimary !== undefined) user.contacts[contactIndex].isPrimary = isPrimary;

    await user.save();

    res.json({
      message: 'Contact updated successfully',
      contacts: user.contacts,
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a contact
router.delete('/:userId/:contactIndex', async (req, res) => {
  try {
    const contactIndex = parseInt(req.params.contactIndex);

    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (contactIndex < 0 || contactIndex >= user.contacts.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    user.contacts.splice(contactIndex, 1);
    await user.save();

    res.json({
      message: 'Contact deleted successfully',
      contacts: user.contacts,
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
