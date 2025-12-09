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

const MQTT_BROKER = 'mqtt://broker.hivemq.com';
// O "+" permite pegar mensagens de qualquer usuário (ex: academia/joao/contador)
const MQTT_TOPIC = 'academia/+/contador'; 

console.log("📡 Iniciando conexão MQTT...");
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📩 MQTT recebido:`, payload);

    // Lógica de Salvamento
    if (payload.status === 'finalizado' && payload.reps > 0) {
      
      console.log("💾 Salvando treino completo...");

      const novoTreino = new Treino({
        userId: payload.userId || "anonimo",
        machine: "LegPress",
        reps: [payload.reps],
        
        // CAPTURA OS NOVOS DADOS DO JSON
        descanso: [payload.restTime], // O ESP32 vai mandar como "restTime"
        tempoTotal: payload.totalTime // O ESP32 vai mandar como "totalTime"
      });

      await novoTreino.save();
      console.log("✅ Treino salvo com métricas de tempo!");
    }

  } catch (erro) {
    console.error("❌ Erro:", erro.message);
  }
});

// ========================================================

// --- 4. Iniciar Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});