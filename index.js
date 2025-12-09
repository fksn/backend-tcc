// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const mqtt = require('mqtt'); // <--- NOVA IMPORTAÇÃO
require('dotenv').config();

const app = express();
app.use(express.json()); 
app.use(cors()); 

// --- 1. Conexão com o Banco ---
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
  .then(() => console.log('✅ Conectado ao MongoDB!'))
  .catch(err => console.error('❌ Erro ao conectar Mongo:', err));

// --- 2. Modelo dos Dados ATUALIZADO ---
const TreinoSchema = new mongoose.Schema({
  userId: String,
  machine: String,
  reps: [Number],
  // NOVOS CAMPOS:
  descanso: [Number], // Array com tempos de descanso entre séries (em segundos)
  tempoTotal: String, // Tempo total formatado (ex: "05:30") ou em segundos
  data: { type: Date, default: Date.now }
});

const Treino = mongoose.model('Treino', TreinoSchema);

// --- 3. Rotas da API (Mantemos para o App usar o Histórico) ---

app.post('/api/treino', async (req, res) => {
  try {
    const { userId, machine, reps } = req.body;
    const novoTreino = new Treino({ userId, machine, reps });
    await novoTreino.save();
    console.log('Treino salvo via HTTP:', novoTreino);
    res.status(201).json({ message: 'Sucesso!', id: novoTreino._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar treino' });
  }
});

app.get('/api/treino/:userId', async (req, res) => {
  try {
    const treinos = await Treino.find({ userId: req.params.userId }).sort({ data: -1 });
    res.json(treinos);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar treinos' });
  }
});

app.get('/', (req, res) => {
  res.send('API do TCC está Online!');
});

// ========================================================
// --- 5. WORKER MQTT (Ouvinte Automático) ---
// ========================================================

// ========================================================
// --- 5. WORKER MQTT (CORRIGIDO E ROBUSTO) ---
// ========================================================

const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = 'academia/+/contador'; 

console.log("📡 Tentando conectar ao Broker MQTT...");

// Configuração explícita para evitar desconexões
const mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId: 'Backend-Render-' + Math.random().toString(16).substr(2, 8), // ID Único
    connectTimeout: 10 * 1000, // 10 segundos para desistir
    reconnectPeriod: 1000, // Tenta reconectar a cada 1 segundo se cair
    clean: true
});

mqttClient.on('connect', () => {
  console.log('✅ SUCESSO: Backend conectado ao HiveMQ!');
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) {
      console.log(`👂 Ouvindo tópico: ${MQTT_TOPIC}`);
    } else {
      console.error('❌ Erro ao assinar tópico:', err);
    }
  });
});

// --- NOVOS LOGS DE ERRO (PARA DESCOBRIR O PROBLEMA) ---
mqttClient.on('error', (err) => {
  console.error('❌ Erro CRÍTICO no MQTT:', err.message);
});

mqttClient.on('offline', () => {
  console.log('⚠️ Backend está OFFLINE do MQTT (Tentando reconectar...)');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📩 Recebido [${topic}]:`, payload);

    if (payload.status === 'finalizado' && payload.reps > 0) {
      console.log("💾 Processando fim de treino...");

      // Verifica se o userId veio correto
      const userIdFinal = payload.userId && payload.userId !== "" ? payload.userId : "Desconhecido";

      const novoTreino = new Treino({
        userId: userIdFinal,
        machine: "LegPress",
        reps: [payload.reps],
        descanso: [payload.restTime || 0], 
        tempoTotal: payload.totalTime || "00:00",
        data: new Date()
      });

      await novoTreino.save();
      console.log(`✅ Treino de ${userIdFinal} salvo no Banco!`);
    }

  } catch (erro) {
    console.error("❌ Erro ao processar mensagem:", erro.message);
  }
});

// ========================================================

// --- 4. Iniciar Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});