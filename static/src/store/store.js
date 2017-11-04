import Vue from 'vue'
import Vuex from 'vuex'
import _ from 'lodash'
import moment from 'moment'
import { addCommas } from '../lib/numbers.js'
import { getProducts } from './products.js'

Vue.use(Vuex)

export default new Vuex.Store({
    state: {
        win: {
            width: null,
            height: null
        },
        products: getProducts(['BTC/USD', 'BTC/EUR', 'BTC/GBP', 'ETH/USD', 'ETH/BTC', 'ETH/EUR', 'LTC/USD', 'LTC/BTC', 'LTC/EUR']),
        selected_id: 1,
        selected_product: 'BTC-USD',
        selected_denom: 'USD',
        salesDepth: 50,

        // websocket variables
        ws: null,
        wsConnected: false,

        // order book variables
        book: {
            asks: [[0.00,0]],
            bids: [[0.00,0]]
        },
        bookDepth: 17,
        bookConnected: false,

        // chart data
        time: [],
        low: [],
        high: [],
        open: [],
        close: [],
        volume: [],
        chartType: 'candle',    // either 'candle' or 'line'
        chartInterval: '1d',    // either '1d' or '1m'
        chartDepth: 50
    },
    mutations: {
        setWin(state, win) {
            state.win = win;
        },
        toggleWS(state) {
            state.wsConnected = !state.wsConnected
        },
        updateProduct(state, id) {
            state.selected_id = id
            state.selected_product = (_.find(state.products, o => {
                return o.id === state.selected_id
            })).product_id
            var arr = _.split(state.selected_product, "-")
            state.selected_denom = arr[1]
        },
        updateTicker(state, ticker) {
            // find correct product
            var i = _.findIndex(state.products, (o) => {
                return o.product_id === ticker.product_id
            })

            if (ticker.sequence > state.products[i].sequence) {
                // only set price/priceDelta on intial ticker message (uses "matches" channel messages to update)
                if (!ticker.time) {
                    state.products[i].price = ticker.price
                    state.products[i].priceDelta24h = ((parseFloat(ticker.price) - (parseFloat(ticker.open_24h))) / parseFloat(ticker.open_24h) * 100)
                }
                
                // set values from ticker message
                state.products[i].best_ask = ticker.best_ask
                state.products[i].best_bid = ticker.best_bid
                state.products[i].high_24h = ticker.high_24h
                state.products[i].low_24h = ticker.low_24h
                state.products[i].open_24h = ticker.open_24h
                state.products[i].sequence = ticker.sequence
                state.products[i].volume_24h = ticker.volume_24h
                state.products[i].volume_30d = ticker.volume_30d

                // update color of % delta element
                if (parseFloat(ticker.price) > parseFloat(ticker.open_24h)) {
                    state.products[i].deltaClass = "has-text-success"
                } else if (parseFloat(ticker.price) < parseFloat(ticker.open_24h)) {
                    state.products[i].deltaClass = "has-text-danger"
                } else {
                    state.products[i].deltaClass = ""
                }
            }
        },
        updatePriceTicker(state, { price, product_id, trade_id }) {
            // find correct product
            var index = _.findIndex(state.products, o => {
                return o.product_id === product_id
            })
            // conditionally set price with most recent trade price
            if (trade_id > state.products[index].trade_id) {
                state.products[index].price = price
                state.products[index].priceDelta24h = ((parseFloat(price) - (parseFloat(state.products[index].open_24h))) / parseFloat(state.products[index].open_24h) * 100)
                state.products[index].trade_id = trade_id
            }
        },
        initTrades(state, { data, product }) {
            // find correct product
            var index = _.findIndex(state.products, o => {
                return o.product_id === product
            })
            // push most recent trade data into state.products[].trades[] and set display classes
            for (var i = 0; i < data.length; i++) {
                if (data[i].side === 'sell') {
                    state.products[index].trades.push({ ...data[i], change: '+', class: "sales-span has-text-right has-text-success" })
                } else if (data[i].side === 'buy') {
                    state.products[index].trades.push({ ...data[i], change: '-', class: "sales-span has-text-right has-text-danger" })
                }
            }

            // conditionally set initial watchlist prices/priceDeltas with most recent trade
            if (data[0].trade_id > state.products[index].trade_id) {
                state.products[index].price = data[0].price
                state.products[index].priceDelta24h = ((parseFloat(data[0].price) - (parseFloat(state.products[index].open_24h))) / parseFloat(state.products[index].open_24h) * 100)
                state.products[index].trade_id = data[0].trade_id
            }
        },
        addTrade(state, { trade, product }) {
            var index = _.findIndex(state.products, o => {
                return o.product_id === product
            })
            if (trade.side === "sell") {
                state.products[index].trades.unshift({ ...trade, change: '+', class: 'sales-span has-text-right has-text-success' })
            } else if (trade.side === "buy") {
                state.products[index].trades.unshift({ ...trade, change: '-', class: 'sales-span has-text-right has-text-danger' })
            }
        },
        initBook(state, book) {
            state.book = {
                asks: book.asks,
                bids: book.bids
            }
        },
        updateBook(state, update) {
           
        },
        setChartInterval(state, interval) {
            state.chartInterval = interval
        },
        setChartType(state, type) {
            state.chartType = type
        },
        setChartData(state, data) {
            // initialize chart with data from http request
            for ( let i = 0; i < state.chartDepth; i++) {
                state.time[i] = state.chartInterval === '1d' ? moment.unix(data[i][0]).toISOString() : moment.unix(data[i][0]).format().slice(0, -6)
                state.low[i] = data[i][1]
                state.high[i] = data[i][2]
                state.open[i] = data[i][3]
                state.close[i] = data[i][4]
                state.volume[i] = data[i][5]
            }
        },
        updateChartData(state, update) {
            // check date of sale to determine if new bar needs to be added to chart
            var t = state.chartInterval === '1d' ? moment(update.time).toISOString() : moment(update.time).format().slice(0, -6)

            switch(state.chartInterval) {
                case '1d':
                    if (update.price != state.close[0] && t.split('T')[0].split('-')[2] === state.time[0].split('T')[0].split('-')[2]) {
                        // replace current price
                        state.close.shift()
                        state.close.unshift(update.price)
                        
                        // conditionally set new high/low
                        state.low[0] = update.price < state.low[0] ? update.price : state.low[0]
                        state.high[0] = update.price > state.high[0] ? update.price : state.high[0]
                    } else if (t.split('T')[0].split('-')[2] != state.time[0].split('T')[0].split('-')[2]) {
                        // add new bar to dataset
                        state.time.pop()
                        state.time.unshift(t)
                        state.low.pop()
                        state.low.unshift(update.price)
                        state.high.pop()
                        state.high.unshift(update.price)
                        state.open.pop()
                        state.open.unshift(update.price)
                        state.close.pop()
                        state.close.unshift(update.price)
                    }
                    break
                case '1m':
                    if (update.price != state.close[0] && t.split('T')[1].split(':')[1] === state.time[0].split('T')[1].split(':')[1]) {
                        // replace current price
                        state.close.shift()
                        state.close.unshift(update.price)

                        // conditionally set new high/low
                        state.low[0] = update.price < state.low[0] ? update.price : state.low[0]
                        state.high[0] = update.price > state.high[0] ? update.price : state.high[0]
                    } else if (t.split('T')[1].split(':')[1] != state.time[0].split('T')[1].split(':')[1]) {
                         // add new bar to dataset
                         state.time.pop()
                         state.time.unshift(t)
                         state.low.pop()
                         state.low.unshift(update.price)
                         state.high.pop()
                         state.high.unshift(update.price)
                         state.open.pop()
                         state.open.unshift(update.price)
                         state.close.pop()
                         state.close.unshift(update.price)
                    }
                    break
            }
        }
    }
})