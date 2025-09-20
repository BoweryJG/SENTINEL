const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Create Stripe customer for family member
router.post('/create-customer', async (req, res) => {
  try {
    const { familyMemberId, email, name, phone } = req.body;

    // Get family member
    const { data: familyMember, error: familyError } = await supabase
      .from('family_members')
      .select('*, patients(*)')
      .eq('id', familyMemberId)
      .single();

    if (familyError) throw familyError;

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: email || familyMember.email,
      name: name || `${familyMember.first_name} ${familyMember.last_name}`,
      phone: phone || familyMember.phone_primary,
      metadata: {
        family_member_id: familyMemberId,
        patient_id: familyMember.patient_id,
        patient_name: `${familyMember.patients.first_name} ${familyMember.patients.last_name}`
      }
    });

    // Update family member with Stripe customer ID
    await supabase
      .from('family_members')
      .update({ stripe_customer_id: customer.id })
      .eq('id', familyMemberId);

    // Create payment account record
    const { data: paymentAccount } = await supabase
      .from('payment_accounts')
      .insert({
        family_member_id: familyMemberId,
        patient_id: familyMember.patient_id,
        stripe_customer_id: customer.id,
        billing_email: email || familyMember.email,
        billing_phone: phone || familyMember.phone_primary,
        account_status: 'active'
      })
      .select()
      .single();

    res.json({
      success: true,
      customerId: customer.id,
      paymentAccountId: paymentAccount.id
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create payment intent for one-time payment
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, patientId, description, familyMemberId } = req.body;

    // Get patient and payment account
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    const { data: paymentAccount } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('patient_id', patientId)
      .eq('family_member_id', familyMemberId)
      .single();

    if (!paymentAccount || !paymentAccount.stripe_customer_id) {
      throw new Error('Payment account not found or not configured');
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: paymentAccount.stripe_customer_id,
      description: description || `Payment for ${patient.first_name} ${patient.last_name} care`,
      metadata: {
        patient_id: patientId,
        family_member_id: familyMemberId,
        payment_account_id: paymentAccount.id
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    // Record transaction as pending
    await supabase
      .from('transactions')
      .insert({
        payment_account_id: paymentAccount.id,
        patient_id: patientId,
        stripe_payment_intent_id: paymentIntent.id,
        amount: amount,
        transaction_type: 'charge',
        status: 'pending',
        description: description
      });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create subscription for recurring payments
router.post('/create-subscription', async (req, res) => {
  try {
    const { patientId, familyMemberId, monthlyRate, paymentMethodId } = req.body;

    // Get payment account
    const { data: paymentAccount } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('patient_id', patientId)
      .eq('family_member_id', familyMemberId)
      .single();

    if (!paymentAccount || !paymentAccount.stripe_customer_id) {
      throw new Error('Payment account not configured');
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: paymentAccount.stripe_customer_id
    });

    // Set as default payment method
    await stripe.customers.update(paymentAccount.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    // Create or get product
    let product;
    const products = await stripe.products.list({ limit: 100 });
    const existingProduct = products.data.find(p => p.metadata.patient_id === patientId);

    if (existingProduct) {
      product = existingProduct;
    } else {
      const { data: patient } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();

      product = await stripe.products.create({
        name: `Monthly Care - ${patient.first_name} ${patient.last_name}`,
        metadata: {
          patient_id: patientId
        }
      });
    }

    // Create price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(monthlyRate * 100),
      currency: 'usd',
      recurring: {
        interval: 'month'
      }
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: paymentAccount.stripe_customer_id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        patient_id: patientId,
        family_member_id: familyMemberId,
        payment_account_id: paymentAccount.id
      }
    });

    // Update payment account with subscription
    await supabase
      .from('payment_accounts')
      .update({
        stripe_subscription_id: subscription.id,
        payment_method_type: 'card',
        last_four_digits: paymentMethodId.slice(-4)
      })
      .eq('id', paymentAccount.id);

    // Update family member for autopay
    await supabase
      .from('family_members')
      .update({
        autopay_enabled: true,
        payment_method_id: paymentMethodId
      })
      .eq('id', familyMemberId);

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret
    });

  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate invoice
router.post('/generate-invoice', async (req, res) => {
  try {
    const { patientId, items, dueDate } = req.body;

    // Get patient and payment account
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    const { data: paymentAccount } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('patient_id', patientId)
      .single();

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    const taxRate = 0.08; // 8% tax
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${patientId.slice(0, 8)}`;

    // Create invoice in database
    const { data: invoice } = await supabase
      .from('invoices')
      .insert({
        patient_id: patientId,
        payment_account_id: paymentAccount?.id,
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_due: totalAmount,
        status: 'draft',
        line_items: items
      })
      .select()
      .single();

    // Create Stripe invoice if customer exists
    if (paymentAccount?.stripe_customer_id) {
      const stripeInvoice = await stripe.invoices.create({
        customer: paymentAccount.stripe_customer_id,
        collection_method: 'send_invoice',
        days_until_due: 30,
        metadata: {
          invoice_id: invoice.id,
          patient_id: patientId
        }
      });

      // Add line items
      for (const item of items) {
        await stripe.invoiceItems.create({
          customer: paymentAccount.stripe_customer_id,
          invoice: stripeInvoice.id,
          amount: Math.round(item.amount * 100),
          currency: 'usd',
          description: item.description,
          quantity: item.quantity
        });
      }

      // Finalize invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);

      // Update database invoice
      await supabase
        .from('invoices')
        .update({
          stripe_invoice_id: finalizedInvoice.id,
          status: 'sent'
        })
        .eq('id', invoice.id);

      res.json({
        invoiceId: invoice.id,
        invoiceNumber: invoiceNumber,
        stripeInvoiceId: finalizedInvoice.id,
        invoiceUrl: finalizedInvoice.hosted_invoice_url
      });
    } else {
      res.json({
        invoiceId: invoice.id,
        invoiceNumber: invoiceNumber,
        message: 'Invoice created locally. Stripe customer not configured.'
      });
    }

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePayment(event.data.object);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment
async function handlePaymentSuccess(paymentIntent) {
  const { metadata } = paymentIntent;

  // Update transaction
  await supabase
    .from('transactions')
    .update({
      status: 'succeeded',
      stripe_charge_id: paymentIntent.latest_charge,
      processed_at: new Date().toISOString()
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Update invoice if applicable
  if (paymentIntent.invoice) {
    const invoice = await stripe.invoices.retrieve(paymentIntent.invoice);

    await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0],
        amount_paid: invoice.amount_paid / 100,
        amount_due: 0
      })
      .eq('stripe_invoice_id', invoice.id);
  }

  // Create care event
  await supabase
    .from('care_events')
    .insert({
      patient_id: metadata.patient_id,
      event_type: 'payment_received',
      event_category: 'financial',
      severity: 'low',
      title: 'Payment Received',
      description: `Payment of $${paymentIntent.amount / 100} received successfully`
    });
}

// Handle failed payment
async function handlePaymentFailure(paymentIntent) {
  const { metadata } = paymentIntent;

  // Update transaction
  await supabase
    .from('transactions')
    .update({
      status: 'failed'
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Create alert
  await supabase
    .from('alerts')
    .insert({
      patient_id: metadata.patient_id,
      alert_type: 'payment_failed',
      severity: 'medium',
      title: 'Payment Failed',
      description: `Payment of $${paymentIntent.amount / 100} failed. Reason: ${paymentIntent.last_payment_error?.message}`,
      requires_action: true
    });
}

// Handle invoice payment
async function handleInvoicePayment(invoice) {
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_date: new Date().toISOString().split('T')[0],
      amount_paid: invoice.amount_paid / 100,
      amount_due: 0
    })
    .eq('stripe_invoice_id', invoice.id);

  // Record transaction
  await supabase
    .from('transactions')
    .insert({
      patient_id: invoice.metadata.patient_id,
      stripe_charge_id: invoice.charge,
      amount: invoice.amount_paid / 100,
      transaction_type: 'charge',
      status: 'succeeded',
      description: `Invoice ${invoice.number} payment`,
      processed_at: new Date().toISOString()
    });
}

// Handle subscription update
async function handleSubscriptionUpdate(subscription) {
  const { metadata } = subscription;

  await supabase
    .from('payment_accounts')
    .update({
      account_status: subscription.status === 'active' ? 'active' : 'suspended'
    })
    .eq('stripe_subscription_id', subscription.id);
}

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
  const { metadata } = subscription;

  await supabase
    .from('payment_accounts')
    .update({
      account_status: 'cancelled',
      stripe_subscription_id: null
    })
    .eq('stripe_subscription_id', subscription.id);

  await supabase
    .from('family_members')
    .update({
      autopay_enabled: false
    })
    .eq('id', metadata.family_member_id);
}

// Get payment history
router.get('/history/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('patient_id', patientId)
      .order('invoice_date', { ascending: false });

    res.json({
      transactions,
      invoices
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment summary
router.get('/summary/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    // Get patient
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    // Get payment totals
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount, status')
      .eq('patient_id', patientId)
      .eq('status', 'succeeded');

    const totalPaid = transactions?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;

    // Get outstanding balance
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount_due')
      .eq('patient_id', patientId)
      .in('status', ['sent', 'overdue']);

    const outstandingBalance = invoices?.reduce((sum, i) => sum + parseFloat(i.amount_due), 0) || 0;

    res.json({
      patientName: `${patient.first_name} ${patient.last_name}`,
      monthlyRate: patient.monthly_rate,
      totalPaid,
      outstandingBalance,
      accountStatus: outstandingBalance > 0 ? 'balance_due' : 'current'
    });

  } catch (error) {
    console.error('Payment summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;