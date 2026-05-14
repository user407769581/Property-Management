Page({
  data: {
    showLoginPopup: false,
    announcement: null,
    voteTopicId: '',
    voted: false,
    voteSelected: -1,
    options: []
  },
  async onLoad(options) {
    this.announcementId = options.id
    await this.loadAnnouncement()
  },
  async loadAnnouncement() {
    const app = getApp()
    try {
      const result = await app.request({
        url: `/api/mp/announcements/${this.announcementId}`,
        auth: false,
      })
      const announcement = Object.assign({}, result.data, {
        createdAt: app.formatDisplayDate(result.data.createdAt),
        contentText: String(result.data.content || '').replace(/<[^>]+>/g, ''),
      })
      const voteTopic = result.data.voteTopic
      const optionList = voteTopic ? voteTopic.options.map((item) => ({
        id: item.id,
        title: item.title,
        sub: item.title,
        votes: item.votes,
        pct: 0,
      })) : []
      const total = optionList.reduce((sum, item) => sum + item.votes, 0)
      this.setData({
        announcement,
        voteTopicId: voteTopic ? voteTopic.id : '',
        voteTopicStatusText: voteTopic ? app.getVoteTopicStatusText(voteTopic.status) : '',
        options: optionList.map((item) => Object.assign({}, item, {
          pct: total ? Math.round((item.votes / total) * 100) : 0,
        })),
      })
    } catch (error) {
      app.showError(error, '加载公告详情失败')
    }
  },
  selVote(e) {
    if (this.data.voted) return;
    this.setData({ voteSelected: e.currentTarget.dataset.id });
  },
  async submitVote() {
    if (this.data.voteSelected === -1) {
      wx.showToast({ title: '请先选择一个选项', icon: 'none' });
      return;
    }
    const app = getApp()
    if (!app.isUserLoggedIn()) {
      this.setData({ showLoginPopup: true })
      return
    }
    try {
      const isBound = await app.ensureBound()
      if (!isBound) {
        wx.showToast({ title: '请先绑定房屋', icon: 'none' })
        return
      }
      const option = this.data.options[this.data.voteSelected]
      const result = await app.request({
        url: `/api/mp/vote-topics/${this.data.voteTopicId}/vote`,
        method: 'POST',
        data: { optionId: option.id },
      })
      const total = (result.data.options || []).reduce((sum, item) => sum + item.votes, 0)
      this.setData({
        voted: true,
        options: (result.data.options || []).map((item) => ({
          id: item.id,
          title: item.title,
          sub: item.title,
          votes: item.votes,
          pct: total ? Math.round((item.votes / total) * 100) : 0,
        })),
      })
      wx.showToast({ title: '投票成功，感谢参与', icon: 'none' })
    } catch (error) {
      app.showError(error, '投票失败')
    }
  },
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
  },
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },
})