const { App } = require('@slack/bolt')
require('dotenv').config()

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
})

;(async () => {
  await app.start(process.env.PORT || 3000)
  console.log('⚡️ Bolt app is running!')
})()

app.command('/pollit', async ({ command, ack, client }) => {
  console.log('Test')
  await ack()

  try {
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'poll_creation',
        title: {
          type: 'plain_text',
          text: 'Create a Poll',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'question_block',
            label: {
              type: 'plain_text',
              text: 'Poll Question',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'poll_question',
            },
          },
          {
            type: 'input',
            block_id: 'options_block',
            label: {
              type: 'plain_text',
              text: 'Poll Options (comma-separated)',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'poll_options',
            },
          },
        ],
        submit: {
          type: 'plain_text',
          text: 'Create',
        },
      },
    })
  } catch (error) {
    console.error(error)
  }
})

app.view('poll_creation', async ({ ack, body, view, client }) => {
  await ack()

  const pollQuestion = view.state.values.question_block.poll_question.value
  const pollOptions = view.state.values.options_block.poll_options.value
    .split(',')
    .map((option) => option.trim())

  let pollMessage = `${pollQuestion}\n\n`
  const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

  const optionsMap = pollOptions.map((option, index) => ({
    reaction: reactions[index],
    text: option,
    votes: 0,
  }))

  optionsMap.forEach((option, index) => {
    pollMessage += `${option.reaction} - ${option.text}\n`
  })

  try {
    const result = await client.chat.postMessage({
      channel: body.user.id,
      text: pollMessage,
    })

    // Add reactions to the message
    for (let i = 0; i < pollOptions.length; i++) {
      await client.reactions.add({
        name: optionsMap[i].reaction,
        channel: result.channel,
        timestamp: result.ts,
      })
    }

    // TODO: Store in db somewhere fo visualization
  } catch (error) {
    console.error(error)
  }
})
const polls = {} // In-memory storage for simplicity; replace with database for persistence

app.event('reaction_added', async ({ event, client }) => {
  const { reaction, item, user } = event

  const poll = polls[item.ts] // Retrieve the poll data based on the message timestamp

  if (!poll) return // If poll doesn't exist, ignore, maybe handle later

  const option = poll.optionsMap.find((opt) => opt.reaction === reaction)
  if (option && !option.voters.includes(user)) {
    option.votes++
    option.voters.push(user)

    const totalVotes = poll.optionsMap.reduce(
      (sum, opts) => sum + opts.votes,
      0
    )

    let updatedMessage = `${poll.question}\n\n`
    // Clac percentage of votes for each option
    poll.optionsMap.forEach((opt) => {
      const percentage = ((opt.votes / totalVotes) * 100).toFixed(2)
      updatedMessage += `${opt.reaction} - ${opt.text}: ${opt.votes} vote(s) (${percentage}%)\n`
    })

    try {
      await client.chat.update({
        channel: item.channel,
        ts: item.ts,
        text: updatedMessage,
      })
    } catch (error) {
      console.error(error)
    }
  }
})
