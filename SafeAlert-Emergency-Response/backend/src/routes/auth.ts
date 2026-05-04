import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Responder } from '../models/index.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// User Registration
router.post('/register/user', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      contacts: [],
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, type: 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      message: 'User registered successfully',
      userId: user._id,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Responder Registration
router.post('/register/responder', async (req, res) => {
  try {
    const { name, email, password, badgeId, department } = req.body;

    if (!name || !email || !password || !badgeId || !department) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if responder already exists
    const existingResponder = await Responder.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { badgeId: badgeId }
      ]
    });
    
    if (existingResponder) {
      return res.status(400).json({ error: 'Responder already exists with this email or badge ID' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new responder
    const responder = new Responder({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      badgeId,
      department,
      isOnDuty: false,
    });

    await responder.save();

    // Generate token
    const token = jwt.sign(
      { responderId: responder._id, email: responder.email, type: 'responder' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      message: 'Responder registered successfully',
      responderId: responder._id,
      token,
      responder: {
        id: responder._id,
        name: responder.name,
        email: responder.email,
        badgeId: responder.badgeId,
        department: responder.department,
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
router.post('/login/user', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, type: 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        contacts: user.contacts,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Responder Login
router.post('/login/responder', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find responder
    const responder = await Responder.findOne({ email: email.toLowerCase() });
    if (!responder) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, responder.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update on duty status
    responder.isOnDuty = true;
    await responder.save();

    // Generate token
    const token = jwt.sign(
      { responderId: responder._id, email: responder.email, type: 'responder' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      responder: {
        id: responder._id,
        name: responder.name,
        email: responder.email,
        badgeId: responder.badgeId,
        department: responder.department,
        isOnDuty: responder.isOnDuty,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Profile
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update User Contacts
router.put('/user/:id/contacts', async (req, res) => {
  try {
    const { contacts } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { contacts },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Contacts updated', contacts: user.contacts });
  } catch (error) {
    console.error('Update contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Responder Logout (set off duty)
router.post('/logout/responder', async (req, res) => {
  try {
    const { responderId } = req.body;
    
    await Responder.findByIdAndUpdate(responderId, { isOnDuty: false });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
