const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Welcome To You in Our Bistro Boss Server!')
})

app.listen(port, () => {
  console.log(`Bistro Boss Web Running On Port: ${port}`)
})