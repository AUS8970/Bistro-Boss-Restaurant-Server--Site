require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://bistro-boss-aus.web.app',
    'https://bistro-boss-aus.firebaseapp.com'
  ],
  credentials: true,
}))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yn4cz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    // mongodb connect
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // mongodb collection
    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const cartCollection = client.db("bistroDB").collection("carts");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // jwt releted api
    app.post('/jwt', async(req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token });
    })

    // verify token middlewares
    const verifyToken = (req, res, next) => {
      if(!req.headers.authorization){
        return res.status(401).send({message: 'Unauthorized Access'})
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(err){
          return res.status(401).send({message: 'Unauthorized Access'});
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin middlewares
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: "Forbidden Access"})
      }
      next();
    }

    // users releted api
    app.get('/users', verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result)
    });

    app.get('/user/admin/:email', verifyToken, async(req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({message: "Forbidden Access"})
      }

      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if ( user ) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });

    app.post('/users', async(req, res) => {
      const user = req.body;
      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'user already exists', insertedId: null});
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id : new ObjectId(id)};
      const result = await userCollection.deleteOne(query);
      res.send(result)
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = { _id : new ObjectId(id) };
      const updatedDoc = { 
        $set: { 
          role: 'admin' 
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result);
    });

    // get menu data from mongodb menu collection
    app.get('/menu', async(req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.post('/menu', verifyToken, verifyAdmin, async(req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    });

    app.patch('/menu/:id', async(req, res) => {
      const item =req.body;
      const id = req.params.id;
      const filter = { _id: id}
      const updatedDoc = {
        $set: {
          name: item.name,
          categroy: item.categroy,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        }
      }
      const result  =await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result)
    });
    
    // get reviews data from mongodb reviews collection
    app.get('/reviews', async(req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // carts collection
    app.get('/carts', async(req, res) => {
      const email = req.query.email;
      const query = {email: email}
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/carts', async(req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem)
      res.send(result)
    });

    app.delete('/carts/:id', verifyToken, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await cartCollection.deleteOne(query);
      res.send(result)
    });

    // payment intent api
    app.post('/create-payment-intent', async(req, res) => {

      // Get the payment amount from the request body
      const { price } = req.body;

      // Calculate the order amount
      const amount = parseInt(price * 100);

      console.log(amount, 'amount inside the intent')

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        // Verify your integration in this guide by including this parameter
        payment_method_types: ['card'],
      });

      // Send publishable key and PaymentIntent client_secret to client
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // payment related api
    app.post('/payments', async(req, res) => {

      // get & insert payment info
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      console.log('payment info', payment);

      // cart items query for delete
      const query = { _id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }};

      // delete cart items
      const deleteResult = await cartCollection.deleteMany(query);

      // send response
      res.send({paymentResult, deleteResult})
    });

    // admin stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0 ;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    });

    // order stats or analytics
    app.get('/order-stats', verifyToken, verifyAdmin, async(req, res) => {
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: {
              $sum: 1,
            },
            revenue: {
              $sum: '$menuItems.price'
            }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();

      res.send(result);
    });

  } finally {}
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Welcome To You in Our Bistro Boss Server!')
})

app.listen(port, () => {
  console.log(`Bistro Boss Web Running On Port: ${port}`)
})