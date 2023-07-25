// List of allowed origins
const allowedOrigins = [
  process.env.Server,
  process.env.Client,
  process.env.Azure,
  process.env.Prod,
  process.env.Local_API,
  process.env.Local_Client
]

export default allowedOrigins;