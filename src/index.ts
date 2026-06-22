import app from './app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`UAeconomy API → http://localhost:${PORT}`);
  console.log(`Health:         http://localhost:${PORT}/health`);
});
