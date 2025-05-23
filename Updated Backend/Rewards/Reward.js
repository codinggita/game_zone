const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use(cors({
    origin: ['http://localhost:5173', 'https://gamezoneofficial.netlify.app'],
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type'],
}));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Rewards';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected successfully')).catch(err => console.error('MongoDB connection error:', err));

const { Rewards } = require('./models/Rewards');

function isConsecutiveDay(lastDate, currentDate) {
    const last = new Date(lastDate);
    const current = new Date(currentDate);
    last.setUTCHours(5, 30, 0, 0);
    current.setUTCHours(5, 30, 0, 0);
    const diff = current - last;
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.abs(diff) === oneDay;
}

app.post('/reward/login', async (req, res) => {
    const { email } = req.body;
    const currentDate = new Date();

    if (!email) return res.status(400).json({ message: 'Email is required' });

    try {
        let reward = await Rewards.findOne({ email });

        if (!reward) {
            reward = new Rewards({
                email,
                lastLoginDate: currentDate,
                dailyStreak: 1,
                totalStreak: 1,
                isDailyRewardEligible: true,
            });
            await reward.save();
            return res.status(201).json({ message: 'Welcome! Daily streak started.', ...reward.toObject() });
        }

        const lastLogin = new Date(reward.lastLoginDate);
        lastLogin.setUTCHours(5, 30, 0, 0);
        currentDate.setUTCHours(5, 30, 0, 0);

        if (lastLogin.toDateString() === currentDate.toDateString()) {
            return res.json({ message: 'Already logged in today.', ...reward.toObject() });
        }

        if (isConsecutiveDay(reward.lastLoginDate, currentDate)) {
            reward.dailyStreak += 1;
            reward.totalStreak += 1;
        } else {
            reward.dailyStreak = 1;
            reward.totalStreak = 1;
            reward.dailyRewardsClaimed = [];
        }

        if (reward.dailyStreak > 7) {
            reward.dailyStreak = 1;
            reward.dailyRewardsClaimed = [];
        }

        if (reward.totalStreak > 30) {
            reward.totalStreak = 1;
            reward.rewardsClaimed = [];
        }

        reward.isDailyRewardEligible = !reward.dailyRewardsClaimed.includes(reward.dailyStreak);
        reward.isStreakRewardEligible = [10, 20, 30].includes(reward.totalStreak) && !reward.rewardsClaimed.includes(reward.totalStreak);
        reward.lastLoginDate = currentDate;

        await reward.save();
        res.json({ message: 'Login successful!', ...reward.toObject() });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Failed to login or create user', error: error.message });
    }
});

const dailyRewards = [
    { day: 1, coin: 30, cash: 0 },
    { day: 2, coin: 40, cash: 0 },
    { day: 3, coin: 0, cash: 10 },
    { day: 4, coin: 50, cash: 0 },
    { day: 5, coin: 60, cash: 0 },
    { day: 6, coin: 0, cash: 20 },
    { day: 7, coin: 0, cash: 30 },
];

app.patch('/reward/claim-reward', async (req, res) => {
    const { email, rewardType } = req.body;
    const currentDate = new Date();

    if (!email || !rewardType) return res.status(400).json({ message: 'Email and rewardType are required' });

    try {
        let reward = await Rewards.findOne({ email });

        if (!reward) {
            reward = new Rewards({
                email,
                lastLoginDate: currentDate,
                dailyStreak: 1,
                totalStreak: 1,
                isDailyRewardEligible: true,
            });
            await reward.save();
        }

        if (rewardType === 'daily' && reward.isDailyRewardEligible) {
            const currentDay = reward.dailyStreak;
            const dailyReward = dailyRewards.find(r => r.day === currentDay);

            if (!dailyReward || reward.dailyRewardsClaimed.includes(currentDay)) {
                return res.status(400).json({ message: 'Daily reward already claimed or not eligible' });
            }

            reward.coin += dailyReward.coin;
            reward.cash += dailyReward.cash;
            reward.dailyRewardsClaimed.push(currentDay);
            reward.isDailyRewardEligible = false;
        } else if (rewardType === 'streak' && reward.isStreakRewardEligible) {
            const streakReward = { 10: 1, 20: 2, 30: 5 }[reward.totalStreak];

            if (!streakReward || reward.rewardsClaimed.includes(reward.totalStreak)) {
                return res.status(400).json({ message: 'Streak reward already claimed or not eligible' });
            }

            reward.roomCards += streakReward;
            reward.rewardsClaimed.push(reward.totalStreak);
            reward.isStreakRewardEligible = false;
        } else {
            return res.status(400).json({ message: 'Reward not eligible' });
        }

        await reward.save();
        res.json({ message: `${rewardType === 'daily' ? 'Daily' : 'Streak'} reward claimed!`, ...reward.toObject() });
    } catch (error) {
        console.error('Claim error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.patch('/reward/add-coins', async (req, res) => {
    const { email, coins } = req.body;

    if (!email || !coins) return res.status(400).json({ message: 'Email and coins are required' });

    try {
        let reward = await Rewards.findOne({ email });
        if (!reward) {
            reward = new Rewards({ email, coin: 0 });
        }
        reward.coin += coins;
        await reward.save();
        res.json({ message: 'Coins added successfully', ...reward.toObject() });
    } catch (error) {
        console.error('Add coins error:', error);
        res.status(500).json({ message: 'Failed to add coins', error: error.message });
    }
});

app.get('/reward/user/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const reward = await Rewards.findOne({ email });
        if (!reward) return res.status(404).json({ message: 'User not found' });
        res.json(reward.toObject());
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.patch('/reward/collect-level-reward', async (req, res) => {
    const { email, level, rewardType, amount } = req.body;

    if (!email || !level || !rewardType || !amount) {
        return res.status(400).json({ message: 'Email, level, rewardType, and amount are required' });
    }

    try {
        let reward = await Rewards.findOne({ email });
        if (!reward) {
            reward = new Rewards({ email, collectedLevelRewards: [] });
        }

        if (reward.collectedLevelRewards.includes(level)) {
            return res.status(400).json({ message: 'Reward already collected for this level' });
        }

        switch (rewardType) {
            case 'coins':
                reward.coin = (reward.coin || 0) + amount;
                break;
            case 'cash':
                reward.cash = (reward.cash || 0) + amount;
                break;
            case 'roomCards':
                reward.roomCards = (reward.roomCards || 0) + amount;
                break;
            default:
                return res.status(400).json({ message: 'Invalid reward type' });
        }

        reward.collectedLevelRewards = reward.collectedLevelRewards || [];
        reward.collectedLevelRewards.push(level);
        await reward.save();
        res.json({ message: `Level ${level} reward collected!`, ...reward.toObject() });
    } catch (error) {
        console.error('Collect level reward error:', error);
        res.status(500).json({ message: 'Failed to collect level reward', error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});