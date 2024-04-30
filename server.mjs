import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

import jsonServer from 'json-server'
import auth from 'json-server-auth'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import chalk from 'chalk'
import _ from 'lodash'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dbPath = path.join(os.tmpdir(), 'db.json')

// Always delete db.json if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
}

// Create db.json based on db.clear.json
const clearData = fs.readFileSync(
  path.join(__dirname, './data/db.seed.json'),
  'utf8'
)
fs.writeFileSync(dbPath, clearData)
const app = jsonServer.create()
const router = jsonServer.router(path.join(os.tmpdir(), 'db.json'))

// Add the CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Origin, Authorization'
  )
  next()
})

// Add the rewriter middleware
const rules = auth.rewriter({
  users: 600,
  posts: 644,
  comments: 644
})

app.db = router.db

// Add a middleware to add the creation time to the request body
const addCreationTime = (req, res, next) => {
  if (req.method === 'POST') {
    req.body.createdAt = Date.now()
  }
  next()
}

// Add color to the status code in the log
morgan.token('status', function (req, res) {
  const status = res.statusCode
  const color =
    status >= 500
      ? 'red'
      : status >= 400
      ? 'yellow'
      : status >= 300
      ? 'cyan'
      : 'green'
  return chalk[color](status)
})

app.use(bodyParser.json())
app.use(morgan(':method :url :status :response-time ms'))
app.use(addCreationTime)

const getPost = postId => _.find(app.db.get('posts').value(), { id: postId })

const getPostVote = (postId, userId) =>
  _.find(app.db.get('votes').value(), { postId, userId })

const getCommentVote = (commentId, userId) =>
  _.find(app.db.get('votes').value(), { commentId, userId })

const decodeToken = token => parseInt(jwt.decode(token).sub, 10)

// Routes

app.post('/seedDB', (req, res) => {
  // Read the content of db.default.json
  const defaultData = fs.readFileSync(
    path.join(__dirname, './data/db.seed.json'),
    'utf8'
  )

  // Write the content to db.json
  fs.writeFileSync(path.join(os.tmpdir(), 'db.json'), defaultData)

  // Reload the data in the router
  router.db.setState(JSON.parse(defaultData))

  res.send('Database seeded successfully')
})

app.post('/clearDb', (req, res) => {
  // Read the content of db.clear.json
  const clearData = fs.readFileSync(
    path.join(__dirname, './data/db.clear.json'),
    'utf8'
  )

  // Write the content to db.json
  fs.writeFileSync(path.join(os.tmpdir(), 'db.json'), clearData)

  // Reload the data in the router
  router.db.setState(JSON.parse(clearData))

  res.send('Database cleared successfully')
})

app.get('/posts', (req, res, next) => {
  const posts = app.db.get('posts').value()
  const users = app.db.get('users').value()

  const modifiedPosts = posts.map(post => {
    const { comments, ...postWithoutComments } = post

    let upVote = 0
    let downVote = 0

    const votes = app.db.get('votes').filter({ postId: post.id }).value()
    votes.forEach(vote => {
      if (vote.vote === 'up') upVote++
      else if (vote.vote === 'down') downVote++
    })

    const user = users.find(user => user.id === post.userId)

    return {
      ...postWithoutComments,
      userName: user ? user.name : null,
      upVote,
      downVote,
      commentsCount: post.comments ? post.comments.length : 0
    }
  })

  res.json(modifiedPosts)
})

app.post('/posts/:postId/votes', (req, res) => {
  const postId = Number(req.params.postId)
  const post = getPost(postId)
  if (!post) return res.status(404).json('Post not found')

  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')

  const userId = decodeToken(token)
  const vote = req.body.vote
  if (vote !== 'up' && vote !== 'down')
    return res.status(400).json('Invalid vote value. Should be up or down')

  const existingVote = getPostVote(postId, userId)
  if (existingVote) {
    return res.status(400).json('You have already voted for this post')
  }

  const newVote = { postId, userId, createdAt: Date.now(), vote }
  app.db.get('votes').push(newVote).write()
  res.json(newVote)
})

app.delete('/posts/:postId/votes', (req, res) => {
  const postId = Number(req.params.postId)
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')

  const userId = decodeToken(token)
  const existingVote = getPostVote(postId, userId)
  if (!existingVote) return res.status(404).json('Vote not found')

  app.db.get('votes').remove({ postId, userId }).write()
  res.json('Vote deleted')
})

const getComment = (postId, commentId) => {
  const post = _.find(app.db.get('posts').value(), { id: postId })
  if (!post || !post.comments) return null
  return _.find(post.comments, { id: commentId })
}

app.post('/posts/:postId/comments', (req, res) => {
  const postId = Number(req.params.postId)
  const comment = req.body.comment

  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')
  const userId = decodeToken(token)

  let post = app.db.get('posts').find({ id: postId }).value()
  if (!post) {
    return res.status(404).json('Post not found')
  }

  if (!comment || comment.trim() === '') {
    return res.status(400).json('Comment cannot be empty')
  }

  if (!post.comments) {
    post.comments = []
  }

  const highestId = Math.max(0, ...post.comments.map(c => c.id))
  const commentId = highestId + 1

  post.comments.push({
    id: commentId,
    userId,
    text: comment,
    createdAt: Date.now()
  })

  app.db.get('posts').find({ id: postId }).assign(post).write()

  res.json(post)
})

app.post('/posts/:postId/comments/:commentId/votes', (req, res) => {
  const postId = Number(req.params.postId)
  const commentId = Number(req.params.commentId)
  const comment = getComment(postId, commentId)
  if (!comment) return res.status(404).json('Comment not found')

  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')

  const userId = decodeToken(token)
  const vote = req.body.vote
  if (vote !== 'up' && vote !== 'down')
    return res.status(400).json('Invalid vote value. Should be up or down')

  const existingVote = getCommentVote(commentId, userId)
  if (existingVote) {
    return res.status(400).json('You have already voted for this comment')
  }

  const newVote = { commentId, userId, createdAt: Date.now(), vote }
  app.db.get('votes').push(newVote).write()
  res.json(newVote)
})

app.delete('/posts/:postID/comments/:commentId/votes', (req, res) => {
  const commentId = Number(req.params.commentId)
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')

  const userId = decodeToken(token)
  const existingVote = getCommentVote(commentId, userId)
  if (!existingVote) return res.status(404).json('Vote not found')

  app.db.get('votes').remove({ commentId, userId }).write()
  res.json('Vote deleted')
})

app.get('/posts/:postId', (req, res) => {
  const postId = Number(req.params.postId)
  const post = getPost(postId)
  if (!post) return res.status(404).json('Post not found')

  let postUpVote = 0
  let postDownVote = 0

  const postVotes = app.db.get('votes').filter({ postId }).value()
  postVotes.forEach(vote => {
    if (vote.vote === 'up') postUpVote++
    else if (vote.vote === 'down') postDownVote++
  })

  const comments = post.comments || []
  const modifiedComments = comments.map(comment => {
    let commentUpVote = 0
    let commentDownVote = 0

    const commentVotes = app.db
      .get('votes')
      .filter({ commentId: comment.id })
      .value()
    commentVotes.forEach(vote => {
      if (vote.vote === 'up') commentUpVote++
      else if (vote.vote === 'down') commentDownVote++
    })

    const user = app.db.get('users').find({ id: comment.userId }).value()

    // Add vote counts and user name to the comment
    return {
      ...comment,
      userName: user ? user.name : null,
      upVote: commentUpVote,
      downVote: commentDownVote
    }
  })

  const user = app.db.get('users').find({ id: post.userId }).value()

  const modifiedPost = {
    id: post.id,
    userId: post.userId,
    userName: user ? user.name : null,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    upVote: postUpVote,
    downVote: postDownVote,
    commentsCount: modifiedComments.length,
    comments: modifiedComments
  }

  res.json(modifiedPost)
})

app.get('/users/:userId/votes', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json('Unauthorized')

  const userIdFromToken = decodeToken(token)
  const userIdFromParams = Number(req.params.userId)

  if (userIdFromToken !== userIdFromParams) {
    return res.status(403).json('Forbidden: User ID does not match token')
  }

  const votes = app.db.get('votes').filter({ userId: userIdFromParams }).value()

  const postVotes = votes
    .filter(vote => vote.postId)
    .map(vote => ({ postId: vote.postId, vote: vote.vote }))
  const commentVotes = votes
    .filter(vote => vote.commentId)
    .map(vote => ({ commentId: vote.commentId, vote: vote.vote }))

  const result = {
    postVotes,
    commentVotes
  }

  res.json(result)
})

app.use(rules)
app.use(auth)
app.use(router)

const port = 3000
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})
