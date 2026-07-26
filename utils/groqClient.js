import Groq from 'groq-sdk';

let groqInstance = null;

function getGroq() {
  if (!groqInstance) {
    groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqInstance;
}

export default getGroq;
